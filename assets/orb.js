/*
 * Crest88 thinking orb — composing/ribbon state only.
 * Adapted from the audited thinking-orbs 0.1.1 engine used by CentralBrain.
 * Original package: MIT, © Jakub Antalik. No runtime dependencies or network access.
 */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mounted = new WeakMap();

  function hash2(a, b) {
    const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function fibonacciSpherePoint(index, count) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(1 - y * y);
    const angle = index * golden;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
  }

  function makeProjector(yaw, pitch, cx, cy) {
    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    return (x, y, z) => {
      const rx = x * cosYaw + z * sinYaw;
      const rz = -x * sinYaw + z * cosYaw;
      const ry = y * cosPitch - rz * sinPitch;
      const depth = y * sinPitch + rz * cosPitch;
      return [cx + rx, cy - ry, depth];
    };
  }

  function paintDots(ctx, dots, dark, minimumRadius) {
    dots.sort((a, b) => a.z - b.z);
    for (const dot of dots) {
      const alpha = dot.a ?? 1;
      if (alpha < 0.02) continue;
      const shade = Math.min(1, Math.max(0, dot.white));
      const channel = Math.round((dark ? 1 - shade : shade) * 255);
      ctx.fillStyle = `rgba(${channel},${channel},${channel},${alpha})`;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, Math.max(minimumRadius, dot.r), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRibbon(ctx, size, time, dark) {
    const center = size / 2;
    const radius = (size / 2) * 0.78;
    const projector = makeProjector(0, 0.3, center, center);
    const scale = (size / 300) ** 0.6;
    const dots = [];
    const density = Math.max(18, Math.round(150 * 0.051));
    const ghostRadius = Math.max(0.28, 0.8 * scale);

    for (let index = 0; index < density; index += 1) {
      const sample = fibonacciSpherePoint(index, density);
      const [x, y, z] = projector(
        sample[0] * radius,
        sample[1] * radius,
        sample[2] * radius,
      );
      const depth = (z / radius + 1) / 2;
      dots.push({ x, y, z, r: ghostRadius, white: 0.78, a: 0.1 + 0.22 * depth });
    }

    const heading = 0;
    const tilt = 0.55 + 0.3 * Math.sin(time * 0.18);
    const x = Math.cos(heading);
    const z = Math.sin(heading);
    const yAxisX = -z * Math.sin(tilt);
    const yAxisY = Math.cos(tilt);
    const yAxisZ = x * Math.sin(tilt);
    const normalX = -z * yAxisY;
    const normalY = z * yAxisX - x * yAxisZ;
    const normalZ = x * yAxisY;
    const lanes = 25;
    const segments = 36;

    for (let lane = 0; lane < lanes; lane += 1) {
      const offset = (lane - (lanes - 1) / 2) * 0.075;
      const distance = Math.abs(lane - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2);

      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        const wobble =
          0.16 * Math.sin(angle * 3 - time * 1.7 + lane * 0.22) +
          0.07 * Math.sin(angle * 5 + time * 1.1);
        const elevation = offset + wobble;
        const px = x * Math.cos(angle) + yAxisX * Math.sin(angle) + normalX * elevation;
        const py = yAxisY * Math.sin(angle) + normalY * elevation;
        const pz = z * Math.cos(angle) + yAxisZ * Math.sin(angle) + normalZ * elevation;
        const magnitude = Math.sqrt(px * px + py * py + pz * pz);
        const [screenX, screenY, depth] = projector(
          (px / magnitude) * radius,
          (py / magnitude) * radius,
          (pz / magnitude) * radius,
        );
        const depthRatio = (depth / radius + 1) / 2;
        dots.push({
          x: screenX,
          y: screenY,
          z: depth,
          r: (1.18 + 1.82 * depthRatio) * (1 - 0.25 * distance) * scale,
          white: 0.52 - 0.44 * depthRatio + 0.18 * distance,
          a: 0.4 + 0.6 * depthRatio,
        });
      }
    }

    paintDots(ctx, dots, dark, 0.3);
  }

  function isDark(canvas) {
    return Boolean(canvas.closest('[data-theme="dark"]'));
  }

  function mount(canvas) {
    if (mounted.has(canvas)) return;

    const size = Number(canvas.dataset.size || 32);
    const speed = Number(canvas.dataset.speed || 0.82) * 3.12;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    let frame = 0;
    let visible = true;
    let running = false;

    function render(time) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      drawRibbon(ctx, size, time, isDark(canvas));
      drawRibbon(ctx, size, time, isDark(canvas));
      const tint = getComputedStyle(canvas).getPropertyValue('--primary').trim();
      if (tint) {
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    function tick(now) {
      if (!running) return;
      render((now / 1000) * speed);
      frame = window.requestAnimationFrame(tick);
    }

    function start() {
      if (running || reducedMotion.matches || !visible || document.hidden) return;
      running = true;
      frame = window.requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      window.cancelAnimationFrame(frame);
    }

    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? false;
          if (visible) start();
          else stop();
        })
      : null;

    observer?.observe(canvas);
    render(reducedMotion.matches ? 0.6 : hash2(size, 8.8));
    if (!observer) start();

    const onMotionChange = () => {
      if (reducedMotion.matches) {
        stop();
        render(0.6);
      } else {
        start();
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    reducedMotion.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibility);

    mounted.set(canvas, {
      stop,
      destroy() {
        stop();
        observer?.disconnect();
        reducedMotion.removeEventListener('change', onMotionChange);
        document.removeEventListener('visibilitychange', onVisibility);
      },
    });
  }

  window.Crest88Orb = {
    mountAll(root = document) {
      root.querySelectorAll('canvas[data-orb]').forEach(mount);
    },
  };
})();
