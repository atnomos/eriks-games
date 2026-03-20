import * as THREE from 'three';

// ─── Three.js Scene Setup ────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color('#08111f');
scene.fog = new THREE.Fog(0x08111f, 700, 2000);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 300, 320);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = 'game-renderer';
document.body.insertBefore(renderer.domElement, document.body.firstChild);

// ─── Follow camera ────────────────────────────────────────────────────────────

const _camGoal  = new THREE.Vector3(0, 300, 320);
const _lookGoal = new THREE.Vector3(0, 10, 0);
const _currentLook = new THREE.Vector3(0, 10, 0);

const CAM_BACK   = 220;
const CAM_HEIGHT = 160;

// _camYaw is the orbit angle of the camera around the player (direction FROM player TO camera).
// Camera-relative controls rotate player input by this angle so W always moves away from camera.
let _camYaw = Math.PI * 1.5; // start behind the player (player faces PI/2, so camera at PI/2+PI)

function snapCameraToPlayer() {
  const player = penguins.find(p => p.isPlayer);
  if (!player) return;
  _camYaw = player.angle + Math.PI;
  const px = player.x - CX, pz = player.y - CY;
  camera.position.set(px + Math.cos(_camYaw) * CAM_BACK, CAM_HEIGHT, pz + Math.sin(_camYaw) * CAM_BACK);
  _currentLook.set(px, 10, pz);
  camera.lookAt(_currentLook);
}

function updateCamera() {
  const player = penguins.find(p => p.isPlayer);

  if ((gameState === 'playing' || gameState === 'countdown') && player?.alive) {
    const px = player.x - CX, pz = player.y - CY;

    // Smoothly rotate the orbit angle toward directly behind the player (shortest arc).
    // Only chase the player's facing angle while they're actually moving.
    if (player.speed > 0.5) {
      const targetYaw = player.angle + Math.PI;
      let diff = targetYaw - _camYaw;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      _camYaw += diff * 0.08;
    }

    camera.position.set(px + Math.cos(_camYaw) * CAM_BACK, CAM_HEIGHT, pz + Math.sin(_camYaw) * CAM_BACK);
    _lookGoal.set(px, 10, pz);
    _currentLook.lerp(_lookGoal, 0.15);
  } else {
    _camGoal.set(0, 300, 320);
    camera.position.lerp(_camGoal, 0.05);
    _lookGoal.set(0, 10, 0);
    _currentLook.lerp(_lookGoal, 0.08);
  }

  camera.lookAt(_currentLook);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelCanvas.width  = window.innerWidth;
  labelCanvas.height = window.innerHeight;
});

// ─── Lighting ────────────────────────────────────────────────────────────────

const ambient = new THREE.AmbientLight(0xc8deff, 0.65); // cool blue-white winter light
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(-200, 400, 150);
scene.add(dirLight);

// ─── World objects ───────────────────────────────────────────────────────────

// Ocean floor
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshLambertMaterial({ color: 0x040d1c })
);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -60;
scene.add(ocean);

// Subtle fog-like water rings (rendered as flat ring meshes)
for (let i = 1; i <= 4; i++) {
  const r = 320 + i * 120;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r, r + 3, 64),
    new THREE.MeshBasicMaterial({ color: 0x1a4a7a, transparent: true, opacity: 0.18 - i * 0.03, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -59;
  scene.add(ring);
}

// Platform
const PLAT_R_INIT = 260;
const platGeo = new THREE.CylinderGeometry(PLAT_R_INIT, PLAT_R_INIT, 20, 64);
const platMat = new THREE.MeshLambertMaterial({ color: 0x7ec5e2 });
const platform = new THREE.Mesh(platGeo, platMat);
platform.position.y = 0; // top surface at y=10
scene.add(platform);



// Ice crack lines on the surface
const crackMat = new THREE.LineBasicMaterial({ color: 0x8ccded, transparent: true, opacity: 0.55 });
const crackSeeds = [0.3, 1.1, 2.0, 2.9, 4.2, 5.0];
const crackLines = crackSeeds.map(startAng => {
  const points = [];
  let x = Math.cos(startAng) * (15 + Math.random() * 25);
  let z = Math.sin(startAng) * (15 + Math.random() * 25);
  points.push(new THREE.Vector3(x, 10.2, z));
  let ang = startAng;
  let rem = 45 + Math.random() * 55;
  while (rem > 0) {
    ang += (Math.random() - 0.5) * 0.9;
    const seg = 10 + Math.random() * 16;
    x += Math.cos(ang) * seg;
    z += Math.sin(ang) * seg;
    points.push(new THREE.Vector3(x, 10.2, z));
    rem -= seg;
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    crackMat
  );
  scene.add(line);
  return line;
});

// ─── Snow particles ───────────────────────────────────────────────────────────

const SNOW_COUNT  = 1200;
const snowPos     = new Float32Array(SNOW_COUNT * 3);
const snowBaseX   = new Float32Array(SNOW_COUNT);
const snowBaseZ   = new Float32Array(SNOW_COUNT);
const snowSpeed   = new Float32Array(SNOW_COUNT);
const snowPhase   = new Float32Array(SNOW_COUNT * 2);

for (let i = 0; i < SNOW_COUNT; i++) {
  const bx = (Math.random() - 0.5) * 1400;
  const bz = (Math.random() - 0.5) * 1400;
  snowBaseX[i]      = bx;
  snowBaseZ[i]      = bz;
  snowPos[i*3]      = bx;
  snowPos[i*3 + 1]  = Math.random() * 700 - 80; // spread from -80 to 620
  snowPos[i*3 + 2]  = bz;
  snowSpeed[i]      = 0.25 + Math.random() * 0.55;
  snowPhase[i*2]    = Math.random() * Math.PI * 2;
  snowPhase[i*2+1]  = Math.random() * Math.PI * 2;
}

const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowMat = new THREE.PointsMaterial({
  color: 0xddeeff,
  size: 4.5,
  transparent: true,
  opacity: 0.82,
  sizeAttenuation: true,
});
const snowParticles = new THREE.Points(snowGeo, snowMat);
scene.add(snowParticles);

function updateSnow(dt, elapsed) {
  const arr  = snowParticles.geometry.attributes.position.array;
  const step = dt / 16.67; // normalise to 60fps
  for (let i = 0; i < SNOW_COUNT; i++) {
    arr[i*3 + 1] -= snowSpeed[i] * step;
    arr[i*3]      = snowBaseX[i] + Math.sin(elapsed * 0.0006 + snowPhase[i*2])    * 18;
    arr[i*3 + 2]  = snowBaseZ[i] + Math.cos(elapsed * 0.0004 + snowPhase[i*2+1]) * 12;
    if (arr[i*3 + 1] < -80) arr[i*3 + 1] = 620;
  }
  snowParticles.geometry.attributes.position.needsUpdate = true;
}

// ─── Label canvas overlay ────────────────────────────────────────────────────

const labelCanvas = document.getElementById('label-canvas');
const labelCtx    = labelCanvas.getContext('2d');
labelCanvas.width  = window.innerWidth;
labelCanvas.height = window.innerHeight;

function labelRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

// ─── Movement arrows ─────────────────────────────────────────────────────────

const arrowGroup = new THREE.Group();
scene.add(arrowGroup);
arrowGroup.visible = false;

const arrowCone = new THREE.Mesh(
  new THREE.ConeGeometry(11, 30, 8),
  new THREE.MeshBasicMaterial({ color: 0xffe44d, transparent: true, opacity: 0.92, depthTest: false })
);
arrowCone.rotation.x = Math.PI / 2; // tip points in +Z
arrowCone.position.y = 52;
arrowGroup.add(arrowCone);

function updateArrows() {
  const player = penguins.find(p => p.isPlayer && p.alive);
  if (!player || !(gameState === 'playing' || gameState === 'countdown')) {
    arrowGroup.visible = false;
    return;
  }

  let ax = 0, az = 0;
  if (keys['KeyA'] || keys['ArrowLeft'])  ax -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
  if (keys['KeyW'] || keys['ArrowUp'])    az -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  az += 1;

  const len = Math.hypot(ax, az);
  if (len === 0) { arrowGroup.visible = false; return; }

  const nx = ax / len;
  const nz = az / len;
  arrowGroup.visible    = true;
  arrowGroup.position.set(player.x - CX + nx * 50, 10, player.y - CY + nz * 50);
  arrowGroup.rotation.y = Math.atan2(nx, nz);
}

// ─── Config ──────────────────────────────────────────────────────────────────

// 2D coordinate space preserved for physics — platform center at CX, CY
const CX = 400, CY = 300;

const P_R          = 24;    // penguin collision radius
const FRICTION     = 0.88;
const PLAYER_ACCEL = 0.48;
const MAX_SPEED    = 5.8;
const RESTITUTION  = 0.60;
const MIN_IMPULSE  = 1.4;
const PLAT_MIN     = 0;
const SHRINK_RATE  = 4;     // units per second

const AI_PROFILES = {
  Rex:  { aggressionChance: 0.28, chargeSpeed: 0.60, retreatThreshold: 0.50 },
  Blu:  { aggressionChance: 0.15, chargeSpeed: 0.50, retreatThreshold: 0.42 },
  Coco: { aggressionChance: 0.20, chargeSpeed: 0.55, retreatThreshold: 0.46 },
};

// ─── Audio ───────────────────────────────────────────────────────────────────

let audioCtx = null;

function resumeAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function schedOsc(freq, dur, type, vol, t) {
  const osc = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env);
  env.connect(audioCtx.destination);
  osc.start(Math.max(t, audioCtx.currentTime));
  osc.stop(Math.max(t, audioCtx.currentTime) + dur + 0.01);
}

function sfxCollision() {
  const ctx = resumeAudio(), t = ctx.currentTime;
  schedOsc(190, 0.07, 'square',   0.20, t);
  schedOsc(95,  0.10, 'sawtooth', 0.14, t + 0.02);
}

function sfxFall() {
  const ctx = resumeAudio();
  const osc = ctx.createOscillator(), env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(500, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
  env.gain.setValueAtTime(0.24, ctx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
  osc.connect(env); env.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.52);
}

function sfxTick() {
  const ctx = resumeAudio();
  schedOsc(440, 0.10, 'square', 0.28, ctx.currentTime);
}

function sfxGo() {
  const ctx = resumeAudio(), t = ctx.currentTime;
  schedOsc(880,  0.09, 'square', 0.30, t);
  schedOsc(1175, 0.20, 'square', 0.24, t + 0.09);
}

function sfxWin() {
  const ctx = resumeAudio(), t = ctx.currentTime;
  [523, 659, 784, 1047, 1319].forEach((f, i) => schedOsc(f, 0.18, 'square', 0.20, t + i * 0.10));
}

function sfxLose() {
  const ctx = resumeAudio(), t = ctx.currentTime;
  [494, 440, 370, 294].forEach((f, i) => schedOsc(f, 0.22, 'sawtooth', 0.16, t + i * 0.13));
}

// ─── Music ───────────────────────────────────────────────────────────────────

const BPM = 148;
const E   = 60 / BPM / 2; // eighth-note duration ≈ 0.203 s

// 8-bar upbeat melody [freq, eighths] — 64 steps total
const MELODY = [
  [523,1],[659,1],[784,1],[659,1],[523,1],[659,1],[784,2],
  [880,1],[784,1],[659,1],[784,1],[659,1],[523,1],[392,2],
  [523,1],[659,1],[784,1],[659,1],[523,1],[659,1],[784,2],
  [880,1],[1047,1],[880,1],[784,1],[523,4],
  [698,1],[784,1],[698,1],[659,1],[587,1],[659,1],[698,2],
  [659,1],[587,1],[523,1],[587,1],[659,2],[523,2],
  [523,1],[659,1],[784,1],[880,1],[784,1],[659,1],[784,2],
  [659,1],[587,1],[523,1],[392,1],[523,2],[523,2],
];

// 8-bar bass [freq, eighths] — 64 steps total
const BASS = [
  [130,2],[196,2],[130,2],[196,2],
  [110,2],[165,2],[130,2],[196,2],
  [130,2],[196,2],[130,2],[196,2],
  [110,2],[165,2],[130,4],
  [130,2],[165,2],[175,2],[196,2],
  [110,2],[130,2],[110,2],[98,2],
  [130,2],[196,2],[165,2],[196,2],
  [130,4],[130,4],
];

// Drum pattern (repeats every bar)
const DRUMS = [['K',1],['.',1],['S',1],['.',1],['K',1],['.',1],['S',1],['.',1]];

let musicPlaying = false;
let mIdx=0, bIdx=0, dIdx=0, mT=0, bT=0, dT=0;
let musicInterval = null;

function schedKick(t) {
  const osc = audioCtx.createOscillator(), env = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  env.gain.setValueAtTime(0.38, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(env); env.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + 0.25);
}

function schedSnare(t) {
  const osc = audioCtx.createOscillator(), env = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(550, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.09);
  env.gain.setValueAtTime(0.09, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
  osc.connect(env); env.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + 0.12);
}

function scheduleMusicChunk() {
  if (!musicPlaying || !audioCtx) return;
  const ahead = audioCtx.currentTime + 0.3;

  while (mT < ahead) {
    const [f, s] = MELODY[mIdx % MELODY.length];
    schedOsc(f, s * E * 0.85, 'square', 0.07, mT);
    mT += s * E; mIdx++;
  }
  while (bT < ahead) {
    const [f, s] = BASS[bIdx % BASS.length];
    schedOsc(f, s * E * 0.65, 'triangle', 0.10, bT);
    bT += s * E; bIdx++;
  }
  while (dT < ahead) {
    const [type, s] = DRUMS[dIdx % DRUMS.length];
    if (type === 'K') schedKick(dT);
    else if (type === 'S') schedSnare(dT);
    dT += s * E; dIdx++;
  }
}

function startMusic() {
  if (musicPlaying) return;
  resumeAudio();
  musicPlaying = true;
  mIdx = bIdx = dIdx = 0;
  mT = bT = dT = audioCtx.currentTime + 0.15;
  scheduleMusicChunk();
  musicInterval = setInterval(scheduleMusicChunk, 100);
}

function stopMusic() {
  musicPlaying = false;
  clearInterval(musicInterval);
}

// ─── Game state ──────────────────────────────────────────────────────────────

let penguins      = [];
let gameState     = 'start';
let countdown     = 3;
let countdownTime = 0;
let platRadius    = PLAT_R_INIT;

const TOTAL_ROUNDS       = 3;
let roundNum             = 0;
let wins                 = {};
let roundWinner          = null;
let roundTransitionTimer = 0;

// ─── Input ───────────────────────────────────────────────────────────────────

const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' && gameState === 'start') startGame();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });

// ─── Penguin 3D model factory ─────────────────────────────────────────────────

function makePenguinMesh(colorHex) {
  const group  = new THREE.Group();
  const r      = P_R;
  const color  = parseInt(colorHex.replace('#', ''), 16);

  // --- Materials ---
  const blackMat    = new THREE.MeshPhongMaterial({ color: 0x1a1a2e, shininess: 30 });
  const bellyMat    = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 20 });
  const faceMat     = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 15 });
  const eyeWhiteMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 });
  const pupilMat    = new THREE.MeshPhongMaterial({ color: 0x050505, shininess: 80 });
  const beakMat     = new THREE.MeshPhongMaterial({ color: 0xe8922d, shininess: 40 });
  const footMat     = new THREE.MeshPhongMaterial({ color: 0xe8922d, shininess: 30 });
  const accentMat   = new THREE.MeshPhongMaterial({ color, shininess: 50 });

  // --- Body (egg-shaped sphere) ---
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(r * 0.65, 24, 24),
    blackMat
  );
  body.scale.set(1.0, 1.4, 0.9);
  body.position.set(0, r * 0.92, 0);
  group.add(body);

  // --- Belly (white front patch) ---
  const belly = new THREE.Mesh(new THREE.SphereGeometry(r * 0.58, 24, 24), bellyMat);
  belly.scale.set(0.78, 1.30, 0.65);
  belly.position.set(0, r * 0.85, r * 0.40);
  group.add(belly);

  // --- Tail (small nub) ---
  const tail = new THREE.Mesh(
    new THREE.SphereGeometry(r * 0.13, 10, 10),
    blackMat
  );
  tail.scale.set(0.6, 0.5, 1.0);
  tail.position.set(0, r * 0.28, -r * 0.55);
  group.add(tail);

  // --- Head ---
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.48, 24, 24), blackMat);
  head.scale.set(1.0, 0.95, 0.92);
  head.position.set(0, r * 1.85, 0);
  group.add(head);

  // --- Face patch (single smooth white area on front of head) ---
  const face = new THREE.Mesh(new THREE.SphereGeometry(r * 0.38, 20, 20), faceMat);
  face.scale.set(0.95, 0.95, 0.6);
  face.position.set(0, r * 1.84, r * 0.48);
  group.add(face);

  // --- Eyes ---
  const eyeGeo = new THREE.SphereGeometry(r * 0.11, 12, 12);
  const eyeL   = new THREE.Mesh(eyeGeo, eyeWhiteMat);
  const eyeR   = new THREE.Mesh(eyeGeo, eyeWhiteMat);
  eyeL.position.set(-r * 0.20, r * 1.95, r * 0.57);
  eyeR.position.set( r * 0.20, r * 1.95, r * 0.57);
  group.add(eyeL, eyeR);

  // --- Pupils ---
  const pupilGeo = new THREE.SphereGeometry(r * 0.058, 10, 10);
  const pupilL   = new THREE.Mesh(pupilGeo, pupilMat);
  const pupilR   = new THREE.Mesh(pupilGeo, pupilMat);
  pupilL.position.set(-r * 0.18, r * 1.96, r * 0.63);
  pupilR.position.set( r * 0.18, r * 1.96, r * 0.63);
  group.add(pupilL, pupilR);

  // --- Eye shine ---
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const shineGeo = new THREE.SphereGeometry(r * 0.028, 6, 6);
  const shineL   = new THREE.Mesh(shineGeo, shineMat);
  const shineR   = new THREE.Mesh(shineGeo, shineMat);
  shineL.position.set(-r * 0.16, r * 1.98, r * 0.65);
  shineR.position.set( r * 0.16, r * 1.98, r * 0.65);
  group.add(shineL, shineR);

  // --- Beak (single cone, wider and flatter) ---
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.10, r * 0.26, 8),
    beakMat
  );
  beak.rotation.x = -Math.PI / 2;
  beak.scale.set(1.4, 1.0, 0.55);
  beak.position.set(0, r * 1.82, r * 0.79);
  group.add(beak);

  // --- Flippers ---
  const flipGeo = new THREE.SphereGeometry(r * 0.28, 12, 12);

  const flipL = new THREE.Mesh(flipGeo, blackMat);
  flipL.scale.set(0.30, 1.5, 0.40);
  flipL.rotation.z = 0.35;
  flipL.position.set(-r * 0.72, r * 0.90, 0);
  group.add(flipL);

  const flipR = new THREE.Mesh(flipGeo, blackMat);
  flipR.scale.set(0.30, 1.5, 0.40);
  flipR.rotation.z = -0.35;
  flipR.position.set(r * 0.72, r * 0.90, 0);
  group.add(flipR);

  // --- Feet (flat orange ovals) ---
  const footGeo = new THREE.SphereGeometry(r * 0.16, 10, 8);

  const footL = new THREE.Mesh(footGeo, footMat);
  footL.scale.set(0.9, 0.25, 1.3);
  footL.position.set(-r * 0.25, r * 0.02, r * 0.18);
  group.add(footL);

  const footR = new THREE.Mesh(footGeo, footMat);
  footR.scale.set(0.9, 0.25, 1.3);
  footR.position.set(r * 0.25, r * 0.02, r * 0.18);
  group.add(footR);

  // --- Team color belly band (cylinder wrapped around lower body) ---
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.58, r * 0.62, r * 0.14, 20),
    accentMat
  );
  band.position.set(0, r * 1.52, 0);
  group.add(band);

  return group;
}

// ─── Penguin class ───────────────────────────────────────────────────────────

class Penguin {
  constructor({ x, y, color, name, isPlayer = false }) {
    this.x        = x;
    this.y        = y;
    this.vx       = 0;
    this.vy       = 0;
    this.color    = color;
    this.name     = name;
    this.isPlayer = isPlayer;
    this.alive    = true;
    this.angle    = Math.PI / 2; // facing direction (rad): 0=right, PI/2=down

    // AI
    this.profile  = AI_PROFILES[name] || AI_PROFILES['Coco'];
    this.aiState  = 'wander';
    this.aiTimer  = Math.random() * 600;
    this.aiGoal   = { x: CX, y: CY };
    this.aiTarget = null;

    // Jump
    this.jumpY  = 0;
    this.jumpVY = 0;

    // 3D mesh
    this.mesh = makePenguinMesh(color);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get distFromCenter() { return Math.hypot(this.x - CX, this.y - CY); }
  get speed()          { return Math.hypot(this.vx, this.vy); }

  // Map 2D (x, y) → 3D position and update mesh rotation
  syncMesh() {
    if (!this.alive) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.mesh.position.set(this.x - CX, 10 + this.jumpY, this.y - CY);
    // 2D angle 0 = +X, PI/2 = +Z in 3D world.  rotation.y = angle - PI/2
    this.mesh.rotation.y = this.angle - Math.PI / 2;
  }

  update(dt) {
    if (!this.alive) return;

    if (this.isPlayer) {
      this._updatePlayer();
    } else {
      this._updateAI(dt);
    }

    this.x += this.vx;
    this.y += this.vy;
    this.vx *= FRICTION;
    this.vy *= FRICTION;

    if (this.speed > 0.35) {
      this.angle = Math.atan2(this.vy, this.vx);
    }

    if (this.jumpY > 0 || this.jumpVY !== 0) {
      this.jumpVY -= 0.45;
      this.jumpY  += this.jumpVY;
      if (this.jumpY <= 0) { this.jumpY = 0; this.jumpVY = 0; }
    }

    if (this.distFromCenter > platRadius + P_R * 0.6) {
      this.alive = false;
      sfxFall();
    }

    this.syncMesh();
  }

  _updatePlayer() {
    if (keys['Space'] && this.jumpY === 0 && this.jumpVY === 0) {
      this.jumpVY = 8;
    }

    let ax = 0, ay = 0;
    if (keys['KeyA'] || keys['ArrowLeft'])  ax -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
    if (keys['KeyW'] || keys['ArrowUp'])    ay -= 1;
    if (keys['KeyS'] || keys['ArrowDown'])  ay += 1;

    const len = Math.hypot(ax, ay);
    if (len > 0) {
      // Rotate input by camera yaw so controls are always relative to the camera.
      // W = forward (away from camera), D = right from camera's view, etc.
      const θ = _camYaw - Math.PI / 2;
      const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
      const wx = (ax * cosθ - ay * sinθ) / len;
      const wy = (ax * sinθ + ay * cosθ) / len;
      this.vx += wx * PLAYER_ACCEL;
      this.vy += wy * PLAYER_ACCEL;
      this._clampSpeed(MAX_SPEED);
    }
  }

  _updateAI(dt) {
    this.aiTimer -= dt;

    const nearEdge = this.distFromCenter > platRadius * this.profile.retreatThreshold;

    if (nearEdge && this.aiState !== 'retreat') {
      this.aiState = 'retreat';
      this.aiTimer = 500 + Math.random() * 400;
      this.aiGoal  = {
        x: CX + (Math.random() - 0.5) * 70,
        y: CY + (Math.random() - 0.5) * 70,
      };
    }

    if (this.aiTimer <= 0) {
      this._pickBehavior();
    }

    let goalX = this.aiGoal.x;
    let goalY = this.aiGoal.y;
    if (this.aiState === 'charge' && this.aiTarget?.alive) {
      goalX = this.aiTarget.x;
      goalY = this.aiTarget.y;
    }

    const dx = goalX - this.x;
    const dy = goalY - this.y;
    const d  = Math.hypot(dx, dy);
    if (d > 4) {
      const mult = this.aiState === 'charge' ? 0.65 : 0.38;
      this.vx += (dx / d) * PLAYER_ACCEL * mult;
      this.vy += (dy / d) * PLAYER_ACCEL * mult;
    }

    const maxSpd = MAX_SPEED * (this.aiState === 'charge' ? this.profile.chargeSpeed : 0.78);
    this._clampSpeed(maxSpd);
  }

  _pickBehavior() {
    const others = penguins.filter(p => p !== this && p.alive);
    if (others.length === 0) return;

    const nearest = others.slice().sort((a, b) =>
      Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y)
    )[0];

    const distToNearest = Math.hypot(nearest.x - this.x, nearest.y - this.y);
    const nearEdge      = this.distFromCenter > platRadius * this.profile.retreatThreshold;

    if (nearEdge) {
      this.aiState = 'retreat';
      this.aiGoal  = { x: CX + (Math.random() - 0.5) * 60, y: CY + (Math.random() - 0.5) * 60 };
      this.aiTimer = 600 + Math.random() * 500;
    } else if (distToNearest < 210 && Math.random() < this.profile.aggressionChance) {
      this.aiState  = 'charge';
      this.aiTarget = nearest;
      this.aiTimer  = 800 + Math.random() * 600;
    } else {
      this.aiState = 'wander';
      const ang    = Math.random() * Math.PI * 2;
      const r      = Math.random() * platRadius * 0.52;
      this.aiGoal  = { x: CX + Math.cos(ang) * r, y: CY + Math.sin(ang) * r };
      this.aiTimer = 700 + Math.random() * 900;
    }
  }

  _clampSpeed(max) {
    const s = this.speed;
    if (s > max) {
      this.vx = (this.vx / s) * max;
      this.vy = (this.vy / s) * max;
    }
  }
}

// ─── Physics ─────────────────────────────────────────────────────────────────

function resolveCollisions() {
  for (let i = 0; i < penguins.length; i++) {
    for (let j = i + 1; j < penguins.length; j++) {
      const a = penguins[i], b = penguins[j];
      if (!a.alive || !b.alive) continue;

      const dx   = b.x - a.x;
      const dy   = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min  = P_R * 2;

      if (dist < min && dist > 0.01) {
        const nx = dx / dist;
        const ny = dy / dist;

        const overlap = (min - dist) * 0.5;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const relVx = a.vx - b.vx;
        const relVy = a.vy - b.vy;
        const dot   = relVx * nx + relVy * ny;

        if (dot > 0) {
          const impulse = Math.max(dot * (1 + RESTITUTION), MIN_IMPULSE);
          if (impulse > 2.2) sfxCollision();
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
        }
      }
    }
  }
}

// ─── Platform scaling ─────────────────────────────────────────────────────────

function updatePlatform() {
  const s = platRadius / PLAT_R_INIT;
  platform.scale.set(s, 1, s);
  crackLines.forEach(line => line.scale.set(s, 1, s));
}

// ─── Overlay drawing ──────────────────────────────────────────────────────────

const _proj = new THREE.Vector3();

function drawLabels() {
  labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);

  // Name tags above each penguin
  penguins.forEach(p => {
    if (!p.alive) return;

    // Project point above penguin head into screen space
    _proj.set(p.x - CX, 10 + P_R * 2.6, p.y - CY);
    _proj.project(camera);

    const sx = ( _proj.x * 0.5 + 0.5) * labelCanvas.width;
    const sy = (-_proj.y * 0.5 + 0.5) * labelCanvas.height;

    labelCtx.save();
    labelCtx.font        = 'bold 12px "DM Sans", sans-serif';
    labelCtx.textAlign   = 'center';
    labelCtx.shadowColor = 'rgba(0,0,0,0.95)';
    labelCtx.shadowBlur  = 6;
    labelCtx.fillStyle   = p.color;
    labelCtx.fillText(p.isPlayer ? 'YOU' : p.name, sx, sy);
    labelCtx.restore();
  });

  // HUD cards — centred under the title bar
  const cardW   = 100, cardGap = 10;
  const totalW  = penguins.length * cardW + (penguins.length - 1) * cardGap;
  const startX  = labelCanvas.width / 2 - totalW / 2;
  const cardY   = 52; // below the title bar

  penguins.forEach((p, i) => {
    const x = startX + i * (cardW + cardGap);
    const y = cardY;

    labelCtx.fillStyle = p.alive ? 'rgba(10,30,60,0.82)' : 'rgba(10,10,20,0.65)';
    labelRoundRect(labelCtx, x, y, 100, 70, 10);
    labelCtx.fill();

    labelCtx.globalAlpha = p.alive ? 1 : 0.3;
    labelCtx.fillStyle   = p.color;
    labelCtx.beginPath();
    labelCtx.arc(x + 18, y + 22, 10, 0, Math.PI * 2);
    labelCtx.fill();
    labelCtx.globalAlpha = 1;

    labelCtx.fillStyle = p.alive ? 'rgba(210,230,255,0.92)' : 'rgba(110,110,125,0.7)';
    labelCtx.font      = 'bold 14px "DM Sans", sans-serif';
    labelCtx.textAlign = 'left';
    labelCtx.fillText(p.isPlayer ? 'YOU' : p.name, x + 36, y + 26);

    labelCtx.fillStyle = p.alive ? '#6ee7b7' : '#f87171';
    labelCtx.font      = '12px "DM Sans", sans-serif';
    labelCtx.fillText(p.alive ? '● alive' : '✕ out', x + 36, y + 43);

    labelCtx.fillStyle = 'rgba(255,220,60,0.85)';
    labelCtx.font      = '500 12px "DM Sans", sans-serif';
    labelCtx.fillText(`★ ${wins[p.name] ?? 0}`, x + 36, y + 59);
  });
}

function drawCountdownOverlay() {
  const label    = countdown > 0 ? String(countdown) : 'GO!';
  const progress = 1 - (countdownTime / 1000);
  const scale    = 1.5 - progress * 0.5;

  const cx = labelCanvas.width  / 2;
  const cy = labelCanvas.height / 2;

  labelCtx.save();
  labelCtx.translate(cx, cy);
  labelCtx.scale(scale, scale);
  labelCtx.textAlign    = 'center';
  labelCtx.textBaseline = 'middle';

  labelCtx.shadowColor = countdown > 0 ? 'rgba(100,180,255,0.85)' : 'rgba(100,255,160,0.85)';
  labelCtx.shadowBlur  = 45;
  labelCtx.font        = `900 140px 'Syne', sans-serif`;
  labelCtx.fillStyle   = countdown > 0 ? '#e8f4ff' : '#6ee7b7';
  labelCtx.fillText(label, 0, 0);
  labelCtx.restore();
}

function drawRoundTransition() {
  const cx = labelCanvas.width  / 2;
  const cy = labelCanvas.height / 2;

  // Backdrop
  labelCtx.fillStyle = 'rgba(3,10,22,0.72)';
  labelCtx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);

  // Round result headline
  const winnerName = roundWinner ? (roundWinner.isPlayer ? 'You' : roundWinner.name) : null;
  const headline   = winnerName
    ? `${winnerName === 'You' ? 'You win' : winnerName + ' wins'} round ${roundNum}!`
    : `Round ${roundNum} — draw!`;

  labelCtx.save();
  labelCtx.textAlign    = 'center';
  labelCtx.textBaseline = 'middle';
  labelCtx.shadowColor  = 'rgba(100,180,255,0.7)';
  labelCtx.shadowBlur   = 30;
  labelCtx.font         = '900 52px "Syne", sans-serif';
  labelCtx.fillStyle    = roundWinner?.isPlayer ? '#6ee7b7' : '#e8f4ff';
  labelCtx.fillText(headline, cx, cy - 56);
  labelCtx.restore();

  // Scores
  labelCtx.textAlign = 'center';
  labelCtx.font      = '500 18px "DM Sans", sans-serif';
  labelCtx.fillStyle = 'rgba(180,215,255,0.65)';
  const scoreStr = penguins.map(p => `${p.isPlayer ? 'You' : p.name}: ${wins[p.name] ?? 0}`).join('  ·  ');
  labelCtx.fillText(scoreStr, cx, cy + 8);

  // Next round countdown
  const secsLeft = Math.ceil(roundTransitionTimer / 1000);
  labelCtx.font      = '400 15px "DM Sans", sans-serif';
  labelCtx.fillStyle = 'rgba(180,215,255,0.38)';
  labelCtx.fillText(`Next round in ${secsLeft}…`, cx, cy + 44);
}

// ─── Game management ──────────────────────────────────────────────────────────

function initPenguins() {
  penguins.forEach(p => scene.remove(p.mesh));

  platRadius = PLAT_R_INIT;
  updatePlatform();

  const s = PLAT_R_INIT * 0.56;
  penguins = [
    new Penguin({ x: CX,       y: CY - s,        color: '#FFD700', name: 'You',  isPlayer: true }),
    new Penguin({ x: CX + s,   y: CY + s * 0.55, color: '#FF6B6B', name: 'Rex' }),
    new Penguin({ x: CX - s,   y: CY + s * 0.55, color: '#4ADE80', name: 'Blu' }),
    new Penguin({ x: CX,       y: CY + s,         color: '#A78BFA', name: 'Coco' }),
  ];
  penguins.forEach(p => p.syncMesh());
}

function checkRoundEnd() {
  const alive = penguins.filter(p => p.alive);
  if (alive.length <= 1) endRound(alive[0] ?? null);
}

function endRound(winner) {
  roundWinner = winner;
  if (winner) wins[winner.name] = (wins[winner.name] ?? 0) + 1;
  stopMusic();

  if (roundNum >= TOTAL_ROUNDS) {
    showGameEnd();
  } else {
    winner?.isPlayer ? sfxWin() : sfxLose();
    gameState = 'roundTransition';
    roundTransitionTimer = 3500;
  }
}

function startNextRound() {
  roundNum++;
  document.getElementById('game-title-bar').textContent = `Penguin Clash — Round ${roundNum} / ${TOTAL_ROUNDS}`;
  initPenguins();
  snapCameraToPlayer();
  countdown     = 3;
  countdownTime = 1000;
  gameState     = 'countdown';
  startMusic();
}

function showGameEnd() {
  const sorted   = penguins.slice().sort((a, b) => (wins[b.name] ?? 0) - (wins[a.name] ?? 0));
  const champion = sorted[0];
  const titleEl  = document.getElementById('roundend-title');
  const subEl    = document.getElementById('roundend-sub');

  if (champion?.isPlayer) { titleEl.textContent = 'You Win!'; sfxWin(); }
  else                    { titleEl.textContent = `${champion?.name ?? 'Nobody'} Wins!`; sfxLose(); }

  subEl.textContent = penguins.map(p => `${p.isPlayer ? 'You' : p.name}: ${wins[p.name] ?? 0}`).join(' · ');
  gameState = 'roundEnd';
  document.getElementById('screen-roundend').classList.add('active');
}

function startGame() {
  roundNum    = 1;
  wins        = {};
  document.getElementById('screen-start').classList.remove('active');
  document.getElementById('screen-roundend').classList.remove('active');
  document.getElementById('game-title-bar').style.display    = 'block';
  document.getElementById('game-title-bar').textContent = `Penguin Clash — Round 1 / ${TOTAL_ROUNDS}`;
  startMusic();
  initPenguins();
  snapCameraToPlayer();
  countdown     = 3;
  countdownTime = 1000;
  gameState     = 'countdown';
}

// ─── Main loop ────────────────────────────────────────────────────────────────

let lastTime  = performance.now();
let elapsed   = 0;

function loop(ts) {
  const dt = Math.min(ts - lastTime, 50);
  lastTime  = ts;
  elapsed  += dt;
  updateSnow(dt, elapsed);

  if (gameState === 'countdown') {
    penguins.forEach(p => p.syncMesh());
    drawLabels();
    drawCountdownOverlay();

    countdownTime -= dt;
    if (countdownTime <= 0) {
      if (countdown > 1) {
        countdown--;
        countdownTime = 1000;
        sfxTick();
      } else if (countdown === 1) {
        countdown     = 0;
        countdownTime = 600;
        sfxGo();
      } else {
        gameState = 'playing';
      }
    }

  } else if (gameState === 'playing') {
    platRadius = Math.max(PLAT_MIN, platRadius - SHRINK_RATE * (dt / 1000));
    updatePlatform();

    penguins.forEach(p => p.update(dt));
    resolveCollisions();
    drawLabels();
    checkRoundEnd();

  } else if (gameState === 'roundTransition') {
    penguins.forEach(p => p.syncMesh());
    labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    drawRoundTransition();
    roundTransitionTimer -= dt;
    if (roundTransitionTimer <= 0) startNextRound();

  } else if (gameState === 'roundEnd') {
    penguins.forEach(p => p.syncMesh());
    drawLabels();

  } else {
    // 'start' state — clear overlay, show empty scene
    labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  }

  updateArrows();
  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-replay').addEventListener('click', () => {
  document.getElementById('screen-roundend').classList.remove('active');
  startGame();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

requestAnimationFrame(loop);
