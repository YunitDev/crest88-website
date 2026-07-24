(function () {
  'use strict';

  const icon = document.querySelector('link[data-motion-icon]');
  const visiblePreview = document.querySelector('[data-motion-preview]');
  const toggle = document.querySelector('[data-motion-toggle]');
  if (!icon) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
  const staticHref = 'candidate-favicon.svg';
  const frameDuration = 500;
  const frameCount = 8;
  let frame = 0;
  let lastFrameAt = 0;
  let animationFrame = 0;
  let manuallyPaused = false;
  let running = false;

  function frameHref(index) {
    const theme = darkMode.matches ? 'dark' : 'light';
    return `motion-${theme}-${index}.png`;
  }

  function previewFrameHref(index) {
    const theme = darkMode.matches ? 'dark' : 'light';
    return `motion-${theme}-${index}.svg`;
  }

  function showFrame(index) {
    icon.href = frameHref(index);
    if (visiblePreview) visiblePreview.src = previewFrameHref(index);
  }

  function updateToggle() {
    if (!toggle) return;
    if (reducedMotion.matches) {
      toggle.textContent = 'Motion off';
      toggle.disabled = true;
      toggle.setAttribute('aria-pressed', 'false');
      return;
    }
    toggle.disabled = false;
    toggle.textContent = running ? 'Pause motion' : 'Play motion';
    toggle.setAttribute('aria-pressed', String(!running));
  }

  function tick(now) {
    if (!running) return;
    if (now - lastFrameAt >= frameDuration) {
      frame = (frame + 1) % frameCount;
      showFrame(frame);
      lastFrameAt = now;
    }
    animationFrame = window.requestAnimationFrame(tick);
  }

  function stop({ restoreStatic = true } = {}) {
    running = false;
    window.cancelAnimationFrame(animationFrame);
    if (restoreStatic) {
      icon.href = staticHref;
      if (visiblePreview) visiblePreview.src = staticHref;
    }
    updateToggle();
  }

  function start() {
    if (
      running ||
      manuallyPaused ||
      document.hidden ||
      reducedMotion.matches
    ) {
      stop();
      return;
    }
    running = true;
    lastFrameAt = performance.now() - frameDuration;
    showFrame(frame);
    updateToggle();
    animationFrame = window.requestAnimationFrame(tick);
  }

  async function preloadAndStart() {
    const sources = Array.from(
      { length: frameCount },
      (_, index) => frameHref(index),
    );
    await Promise.all(
      sources.map(
        (source) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = resolve;
            image.onerror = resolve;
            image.src = source;
          }),
      ),
    );
    start();
  }

  function syncMotion() {
    if (document.hidden || reducedMotion.matches || manuallyPaused) {
      stop();
    } else {
      preloadAndStart();
    }
  }

  toggle?.addEventListener('click', () => {
    if (reducedMotion.matches) return;
    manuallyPaused = running;
    if (manuallyPaused) stop();
    else {
      manuallyPaused = false;
      preloadAndStart();
    }
  });
  document.addEventListener('visibilitychange', syncMotion);
  reducedMotion.addEventListener('change', syncMotion);
  darkMode.addEventListener('change', () => {
    if (running) showFrame(frame);
  });

  preloadAndStart();
})();
