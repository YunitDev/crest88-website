import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const previewDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(previewDir, '..');
const primary = '#5963e7';

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

function orbDots(size, time = 0.6) {
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
    dots.push({ x, y, z, r: ghostRadius, opacity: 0.1 + 0.22 * depth });
  }

  const tilt = 0.55 + 0.3 * Math.sin(time * 0.18);
  const x = 1;
  const z = 0;
  const yAxisX = 0;
  const yAxisY = Math.cos(tilt);
  const yAxisZ = Math.sin(tilt);
  const normalX = 0;
  const normalY = -x * yAxisZ;
  const normalZ = x * yAxisY;
  const lanes = 25;
  const segments = 36;

  for (let lane = 0; lane < lanes; lane += 1) {
    const offset = (lane - (lanes - 1) / 2) * 0.075;
    const distance =
      Math.abs(lane - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2);

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
        r: Math.max(
          0.3,
          (1.18 + 1.82 * depthRatio) * (1 - 0.25 * distance) * scale,
        ),
        opacity: 0.4 + 0.6 * depthRatio,
      });
    }
  }

  return dots.sort((a, b) => a.z - b.z);
}

function dotMarkup(size, className = 'orb-dot', time = 0.6) {
  return orbDots(size, time)
    .map(({ x, y, r, opacity }) => {
      const doubledOpacity = 1 - (1 - opacity) ** 2;
      return `<circle class="${className}" cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${r.toFixed(3)}" opacity="${doubledOpacity.toFixed(3)}"/>`;
    })
    .join('');
}

const faviconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Crest88 orb">
  <style>
    .orb-dot { fill: ${primary}; }
    @media (prefers-color-scheme: dark) { .orb-dot { fill: #8991ff; } }
  </style>
  ${dotMarkup(32)}
</svg>`;

const darkFaviconSvg = faviconSvg
  .replace('${primary}', primary)
  .replaceAll(primary, '#8991ff');

const markSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" role="img" aria-label="Crest88 orb">
  <g fill="${primary}">${dotMarkup(88, 'dot')}</g>
</svg>`;

const touchSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" role="img" aria-label="Crest88 orb">
  <defs>
    <radialGradient id="touch-glow" cx="50%" cy="44%" r="58%">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f2f3ff"/>
    </radialGradient>
  </defs>
  <rect width="180" height="180" rx="42" fill="url(#touch-glow)"/>
  <g transform="translate(20 20)" fill="${primary}">${dotMarkup(140, 'dot')}</g>
</svg>`;

const ogSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">Crest88 — Put AI agents to work in your business</title>
  <desc id="description">AI agents handle repeatable work while important actions wait for your approval.</desc>
  <defs>
    <radialGradient id="atmosphere" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#5963e7" stop-opacity=".18"/>
      <stop offset=".64" stop-color="#5963e7" stop-opacity=".045"/>
      <stop offset="1" stop-color="#5963e7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#f8f9ff"/>
  <circle cx="972" cy="314" r="300" fill="url(#atmosphere)"/>
  <circle cx="972" cy="314" r="232" fill="none" stroke="#5963e7" stroke-opacity=".12" stroke-width="2"/>
  <g transform="translate(70 62)">
    <g transform="translate(0 1) scale(.58)" fill="${primary}">${dotMarkup(88, 'dot')}</g>
    <text x="65" y="36" fill="#171925" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="700">Crest88</text>
  </g>
  <g transform="translate(72 180)">
    <text fill="#5963e7" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" letter-spacing="4">AI AGENTS FOR GROWING BUSINESSES</text>
    <text y="76" fill="#171925" font-family="Arial, Helvetica, sans-serif" font-size="61" font-weight="700">
      <tspan x="0">Put AI agents to work</tspan>
      <tspan x="0" dy="72">in your business.</tspan>
    </text>
    <text y="245" fill="#62687a" font-family="Arial, Helvetica, sans-serif" font-size="27">
      <tspan x="0">They handle the repeatable work.</tspan>
      <tspan x="0" dy="40">You approve anything important.</tspan>
    </text>
  </g>
  <g transform="translate(792 134)" fill="${primary}">${dotMarkup(360, 'dot')}</g>
</svg>`;

writeFileSync(resolve(previewDir, 'candidate-favicon.svg'), faviconSvg);
writeFileSync(resolve(previewDir, 'candidate-favicon-dark.svg'), darkFaviconSvg);
writeFileSync(resolve(previewDir, 'candidate-mark.svg'), markSvg);
writeFileSync(resolve(previewDir, 'candidate-touch.svg'), touchSvg);
writeFileSync(resolve(previewDir, 'candidate-og.svg'), ogSvg);

function render(input, output, ...args) {
  execFileSync('magick', [
    resolve(previewDir, input),
    ...args,
    resolve(previewDir, output),
  ]);
}

render('candidate-mark.svg', 'candidate-mark.png');
render('candidate-touch.svg', 'candidate-touch.png');
render('candidate-og.svg', 'candidate-og.png', '-alpha', 'off', '-colorspace', 'sRGB');

for (const size of [16, 24, 32, 48]) {
  execFileSync('magick', [
    '-background',
    'none',
    resolve(previewDir, 'candidate-favicon.svg'),
    '-alpha',
    'on',
    '-resize',
    `${size}x${size}`,
    resolve(previewDir, `candidate-favicon-${size}.png`),
  ]);
  execFileSync('magick', [
    '-background',
    'none',
    resolve(projectRoot, 'favicon.svg'),
    '-alpha',
    'on',
    '-resize',
    `${size}x${size}`,
    resolve(previewDir, `current-favicon-${size}.png`),
  ]);
}

execFileSync('magick', [
  resolve(previewDir, 'candidate-favicon-16.png'),
  resolve(previewDir, 'candidate-favicon-32.png'),
  resolve(previewDir, 'candidate-favicon-48.png'),
  resolve(previewDir, 'candidate-favicon.ico'),
]);

function motionFrameSvg(color, time) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Crest88 thinking orb">
  <g fill="${color}">${dotMarkup(32, 'dot', time)}</g>
</svg>`;
}

for (let frame = 0; frame < 8; frame += 1) {
  const phase = (frame / 8) * Math.PI * 2;
  const time = 0.6 + 1.15 * Math.sin(phase);
  for (const [theme, color] of [
    ['light', primary],
    ['dark', '#8991ff'],
  ]) {
    const sourceName = `motion-${theme}-${frame}.svg`;
    const outputName = `motion-${theme}-${frame}.png`;
    writeFileSync(resolve(previewDir, sourceName), motionFrameSvg(color, time));
    execFileSync('magick', [
      '-background',
      'none',
      resolve(previewDir, sourceName),
      '-alpha',
      'on',
      '-resize',
      '32x32',
      resolve(previewDir, outputName),
    ]);
  }
}
