/* ==========================================================================
   RepoMind AI — Galaxy Background
   Three layers: deep starfield, drifting nebula sprites, and the signature
   "codegraph" constellation — files rendered as orbiting, linked stars.
   ========================================================================== */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js';

const canvas = document.getElementById('galaxy-canvas');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060d, 0.028);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 26);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

/* ---------------------------------------------------------------------- */
/* helper: soft radial glow texture, drawn once on a canvas                */
/* ---------------------------------------------------------------------- */
function makeGlowTexture(hex) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, hex + 'ff');
  grad.addColorStop(0.35, hex + '99');
  grad.addColorStop(1, hex + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeLabelTexture(text) {
  const padX = 14, h = 40;
  const font = '500 22px "JetBrains Mono", monospace';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + padX * 2;
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(180, 220, 255, 0.85)';
  ctx.fillText(text, padX, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return { tex, aspect: w / h };
}

const glowCyan = makeGlowTexture('#4deaff');
const glowBlue = makeGlowTexture('#4d7fff');
const glowViolet = makeGlowTexture('#a855f7');
const glowWhite = makeGlowTexture('#ffffff');

/* ---------------------------------------------------------------------- */
/* starfield — two depth layers for gentle parallax                       */
/* ---------------------------------------------------------------------- */
function buildStarLayer(count, spread, size, opacity) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread - 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size,
    map: glowWhite,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

const starsFar = buildStarLayer(1400, 160, 0.55, 0.55);
const starsNear = buildStarLayer(500, 90, 0.9, 0.8);
scene.add(starsFar, starsNear);

/* ---------------------------------------------------------------------- */
/* nebula — a few soft additive sprites drifting slowly                   */
/* ---------------------------------------------------------------------- */
const nebulaGroup = new THREE.Group();
const nebulaSpecs = [
  { tex: glowBlue, pos: [-14, 6, -30], scale: 42, opacity: 0.22 },
  { tex: glowViolet, pos: [16, -8, -34], scale: 48, opacity: 0.18 },
  { tex: glowCyan, pos: [4, 12, -40], scale: 36, opacity: 0.14 },
];
nebulaSpecs.forEach((spec) => {
  const mat = new THREE.SpriteMaterial({ map: spec.tex, transparent: true, opacity: spec.opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(...spec.pos);
  sprite.scale.set(spec.scale, spec.scale, 1);
  nebulaGroup.add(sprite);
});
scene.add(nebulaGroup);

/* ---------------------------------------------------------------------- */
/* signature element — the codegraph constellation                        */
/* files from a hypothetical repo, laid out as linked orbiting nodes      */
/* ---------------------------------------------------------------------- */
const files = [
  'auth/jwt.py', 'auth/middleware.py', 'api/routes.py', 'api/endpoints/users.py',
  'db/models.py', 'db/session.py', 'chat/engine.py', 'chat/memory.py',
  'embeddings/index.py', 'embeddings/chroma.py', 'core/config.py', 'core/security.py',
  'services/repo_parser.py', 'services/graph_builder.py',
];

const codegraph = new THREE.Group();
const nodePositions = [];
const labelSprites = [];
const nodeRadius = 9.5;

files.forEach((name, i) => {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / files.length);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const x = nodeRadius * Math.sin(phi) * Math.cos(theta);
  const y = nodeRadius * Math.sin(phi) * Math.sin(theta) * 0.72;
  const z = nodeRadius * Math.cos(phi) * 0.9;
  nodePositions.push(new THREE.Vector3(x, y, z));

  const isCyan = i % 3 === 0;
  const isViolet = i % 3 === 1;
  const tex = isCyan ? glowCyan : isViolet ? glowViolet : glowBlue;

  const dotMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const dot = new THREE.Sprite(dotMat);
  dot.position.copy(new THREE.Vector3(x, y, z));
  dot.scale.set(1.15, 1.15, 1);
  codegraph.add(dot);

  const { tex: labelTex, aspect } = makeLabelTexture(name);
  // fog:false — labels are text and must stay legible regardless of depth;
  // only the manual opacity fade-in below should control their visibility.
  const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const label = new THREE.Sprite(labelMat);
  const labelH = 0.9;
  const baseW = labelH * aspect;
  label.scale.set(baseW, labelH, 1);
  label.position.copy(new THREE.Vector3(x * 1.14, y * 1.14 + 0.6, z * 1.14));
  label.userData.baseOpacity = 0.72;
  label.userData.baseW = baseW;
  label.userData.baseH = labelH;
  codegraph.add(label);
  labelSprites.push(label);
});

// connect nearby nodes so the graph reads as a structure, not a random cloud
const lineGeoPositions = [];
for (let i = 0; i < nodePositions.length; i++) {
  const distances = nodePositions
    .map((p, j) => ({ j, d: i === j ? Infinity : p.distanceTo(nodePositions[i]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  distances.forEach(({ j }) => {
    lineGeoPositions.push(nodePositions[i].x, nodePositions[i].y, nodePositions[i].z);
    lineGeoPositions.push(nodePositions[j].x, nodePositions[j].y, nodePositions[j].z);
  });
}
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineGeoPositions, 3));
const lineMat = new THREE.LineBasicMaterial({ color: 0x4d7fff, transparent: true, opacity: 0.18 });
const lines = new THREE.LineSegments(lineGeo, lineMat);
codegraph.add(lines);

codegraph.position.set(0, 0, -6);
codegraph.rotation.set(0.15, 0.4, 0.05);
scene.add(codegraph);

// fade labels in once the hero has loaded, staggered like a boot sequence
window.setTimeout(() => {
  let delay = 0;
  codegraph.children.forEach((child) => {
    if (child.userData && typeof child.userData.baseOpacity === 'number') {
      delay += 60;
      window.setTimeout(() => {
        const target = child.userData.baseOpacity;
        const start = performance.now();
        const animateIn = (t) => {
          const p = Math.min(1, (t - start) / 500);
          child.material.opacity = target * p;
          if (p < 1) requestAnimationFrame(animateIn);
        };
        requestAnimationFrame(animateIn);
      }, delay);
    }
  });
}, 900);

/* ---------------------------------------------------------------------- */
/* mouse parallax + render loop                                           */
/* ---------------------------------------------------------------------- */
let mouseX = 0, mouseY = 0;
let targetRotX = 0, targetRotY = 0;

window.addEventListener('pointermove', (e) => {
  mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const rotSpeed = prefersReducedMotion ? 0.01 : 0.045;
const tempWorldPos = new THREE.Vector3();
const REFERENCE_DISTANCE = 32; // roughly camera-to-codegraph-center distance at rest

function animate() {
  const t = clock.getElapsedTime();

  starsFar.rotation.y = t * 0.003;
  starsNear.rotation.y = t * 0.006;
  nebulaGroup.children.forEach((s, i) => {
    s.position.x += Math.sin(t * 0.05 + i) * 0.003;
    s.position.y += Math.cos(t * 0.04 + i) * 0.003;
  });

  codegraph.rotation.y = 0.4 + t * rotSpeed;
  codegraph.rotation.x = 0.15 + Math.sin(t * 0.08) * 0.06;

  targetRotX += (mouseY * 0.12 - targetRotX) * 0.04;
  targetRotY += (mouseX * 0.16 - targetRotY) * 0.04;
  camera.position.x += (targetRotY * 3 - camera.position.x) * 0.03;
  camera.position.y += (-targetRotX * 3 - camera.position.y) * 0.03;
  camera.lookAt(0, 0, -6);

  // normalize label size by actual camera distance so text stays legible at
  // every depth, instead of the ~1.7x perspective swing this cluster produces
  codegraph.updateMatrixWorld();
  labelSprites.forEach((label) => {
    label.getWorldPosition(tempWorldPos);
    const distance = tempWorldPos.distanceTo(camera.position);
    const factor = Math.min(1.15, Math.max(0.85, REFERENCE_DISTANCE / distance));
    label.scale.set(label.userData.baseW * factor, label.userData.baseH * factor, 1);
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

function scrollDim(fraction) {
  // fraction: 0 at top of page -> 1 fully scrolled past hero
  const opacity = Math.max(0, 1 - fraction * 1.3);
  canvas.style.opacity = String(opacity);
}
window.__galaxyScrollDim = scrollDim;