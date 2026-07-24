(function () {
  "use strict";

  const icon = document.querySelector(
    'link[rel~="icon"][type="image/svg+xml"]',
  );
  if (!icon || typeof window.matchMedia !== "function") return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const darkMode = window.matchMedia("(prefers-color-scheme: dark)");
  const staticHref = icon.getAttribute("href") || "favicon.svg?v=3";
  const staticType = icon.getAttribute("type") || "image/svg+xml";
  const frameCount = 8;
  const frameDuration = 500;
  let frame = 0;
  let frameTimer = 0;
  let preloadToken = 0;
  let running = false;

  function frameHref(index) {
    const theme = darkMode.matches ? "dark" : "light";
    return `assets/favicon/motion-${theme}-${index}.png?v=3`;
  }

  function showFrame(index) {
    icon.setAttribute("type", "image/png");
    icon.setAttribute("href", frameHref(index));
  }

  function restoreStatic() {
    icon.setAttribute("type", staticType);
    icon.setAttribute("href", staticHref);
  }

  function shouldStop() {
    return document.hidden || reducedMotion.matches;
  }

  function stop() {
    preloadToken += 1;
    running = false;
    window.clearTimeout(frameTimer);
    restoreStatic();
  }

  function advance() {
    if (!running) return;
    frame = (frame + 1) % frameCount;
    showFrame(frame);
    frameTimer = window.setTimeout(advance, frameDuration);
  }

  function start() {
    if (shouldStop()) {
      restoreStatic();
      return;
    }
    running = true;
    frame = 0;
    showFrame(frame);
    frameTimer = window.setTimeout(advance, frameDuration);
  }

  async function preloadAndStart() {
    const token = ++preloadToken;
    if (shouldStop()) {
      restoreStatic();
      return;
    }
    const loaded = await Promise.all(
      Array.from({ length: frameCount }, (_, index) => frameHref(index)).map(
        (source) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = source;
          }),
      ),
    );
    if (token !== preloadToken) return;
    if (!loaded.every(Boolean) || shouldStop()) {
      restoreStatic();
      return;
    }
    start();
  }

  function syncMotion() {
    if (shouldStop()) {
      stop();
    } else {
      preloadAndStart();
    }
  }

  function listen(mediaQuery, listener) {
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(listener);
    }
  }

  document.addEventListener("visibilitychange", syncMotion);
  window.addEventListener("pagehide", stop);
  listen(reducedMotion, syncMotion);
  listen(darkMode, () => {
    stop();
    preloadAndStart();
  });

  preloadAndStart();
})();
