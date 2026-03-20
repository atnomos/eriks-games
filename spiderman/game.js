import * as THREE from 'three';

// ─── Constants ──────────────────────────────────────────────────────────────

const GRAVITY       = 38;
const SWING_DAMPING = 0.998;
const LAUNCH_VY     = 14;
const MAX_WEB_LEN   = 28;
const MIN_WEB_LEN   = 6;
const BUILDING_GAP  = 6;
const FLOOR_Y       = -2;
const CAM_OFFSET_X  = -8;
const CAM_OFFSET_Y  = 12;
const CAM_OFFSET_Z  = 30;

// ─── State ──────────────────────────────────────────────────────────────────

let state = 'start'; // start | playing | gameOver
let score = 0;
let highScore = 0;

// Spider-Man physics
let px = 0, py = 18;
let vx = 0, vy = 0;

// Web
let webAttached  = false;
let anchorX = 0, anchorY = 0;
let ropeLen = 0;

// Buildings
const buildings = [];
let nextBuildingX = -30;

// Three.js
let scene, camera, renderer;
let spiderGroup, webLine;
let clock;

// Audio
let audioCtx = null;

// ─── DOM ────────────────────────────────────────────────────────────────────

const canvas       = document.getElementById('c');
const startScreen  = document.getElementById('start-screen');
const overScreen   = document.getElementById('gameover-screen');
const btnPlay      = document.getElementById('btn-play');
const btnRetry     = document.getElementById('btn-retry');
const hudEl        = document.getElementById('hud');
const hudScore     = document.getElementById('hud-score');
const finalScore   = document.getElementById('final-score');

// ─── Audio ──────────────────────────────────────────────────────────────────

function resumeAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, dur, type = 'square', vol = 0.08) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function sfxWeb()   { playTone(800, 0.08, 'sine', 0.10); playTone(1200, 0.06, 'sine', 0.06); }
function sfxSwing() { playTone(200, 0.15, 'triangle', 0.05); }
function sfxFall()  { playTone(120, 0.5, 'sawtooth', 0.12); playTone(80, 0.6, 'sawtooth', 0.08); }

// ─── Three.js Setup ─────────────────────────────────────────────────────────

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050510);
  scene.fog = new THREE.Fog(0x050510, 60, 120);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(px + CAM_OFFSET_X, py + CAM_OFFSET_Y, CAM_OFFSET_Z);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Lights
  scene.add(new THREE.AmbientLight(0x334466, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(-20, 40, 30);
  scene.add(dir);

  // Moon
  const moonGeo = new THREE.SphereGeometry(3, 24, 24);
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xeeeedd });
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.position.set(-40, 55, -80);
  scene.add(moon);

  // Moon glow
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xeeeedd, transparent: true, opacity: 0.08 });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 24), glowMat);
  glow.position.copy(moon.position);
  scene.add(glow);

  // Stars
  const starGeo = new THREE.BufferGeometry();
  const starVerts = [];
  for (let i = 0; i < 400; i++) {
    starVerts.push(
      (Math.random() - 0.5) * 200,
      Math.random() * 80 + 10,
      -50 - Math.random() * 60
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 });
  scene.add(new THREE.Points(starGeo, starMat));

  // Ground plane (street)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 40),
    new THREE.MeshPhongMaterial({ color: 0x1a1a2a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, FLOOR_Y, 0);
  scene.add(ground);

  // Spider-Man
  spiderGroup = makeSpiderMan();
  scene.add(spiderGroup);

  // Web line
  const webGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0)
  ]);
  const webMat = new THREE.LineBasicMaterial({ color: 0xcccccc, linewidth: 2 });
  webLine = new THREE.Line(webGeo, webMat);
  webLine.visible = false;
  scene.add(webLine);

  clock = new THREE.Clock();

  // Initial buildings
  for (let i = 0; i < 25; i++) spawnBuilding();
}

// ─── Spider-Man Model ───────────────────────────────────────────────────────

function makeSpiderMan() {
  const g = new THREE.Group();
  const red  = new THREE.MeshPhongMaterial({ color: 0xcc1111, shininess: 40 });
  const blue = new THREE.MeshPhongMaterial({ color: 0x1144cc, shininess: 40 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 20 });
  const white = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });

  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 1.4, 12), red);
  torso.position.y = 0;
  g.add(torso);

  // Lower body
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 0.8, 12), blue);
  lower.position.y = -0.9;
  g.add(lower);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 16), red);
  head.position.y = 1.1;
  g.add(head);

  // Eyes (large white angular patches)
  const eyeGeo = new THREE.SphereGeometry(0.16, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, white);
  eyeL.scale.set(1.3, 0.7, 0.5);
  eyeL.position.set(-0.18, 1.15, 0.42);
  g.add(eyeL);

  const eyeR = new THREE.Mesh(eyeGeo, white);
  eyeR.scale.set(1.3, 0.7, 0.5);
  eyeR.position.set(0.18, 1.15, 0.42);
  g.add(eyeR);

  // Eye outlines
  const outlineGeo = new THREE.SphereGeometry(0.18, 8, 8);
  const outlineL = new THREE.Mesh(outlineGeo, dark);
  outlineL.scale.set(1.3, 0.7, 0.45);
  outlineL.position.set(-0.18, 1.15, 0.40);
  g.add(outlineL);

  const outlineR = new THREE.Mesh(outlineGeo, dark);
  outlineR.scale.set(1.3, 0.7, 0.45);
  outlineR.position.set(0.18, 1.15, 0.40);
  g.add(outlineR);

  // Arms
  const armGeo = new THREE.CylinderGeometry(0.12, 0.10, 1.2, 8);
  const armL = new THREE.Mesh(armGeo, red);
  armL.rotation.z = 0.8;
  armL.position.set(-0.7, 0.3, 0);
  g.add(armL);

  const armR = new THREE.Mesh(armGeo, red);
  armR.rotation.z = -0.8;
  armR.position.set(0.7, 0.3, 0);
  g.add(armR);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.14, 0.10, 1.4, 8);
  const legL = new THREE.Mesh(legGeo, blue);
  legL.rotation.z = 0.15;
  legL.position.set(-0.22, -1.8, 0);
  g.add(legL);

  const legR = new THREE.Mesh(legGeo, blue);
  legR.rotation.z = -0.15;
  legR.position.set(0.22, -1.8, 0);
  g.add(legR);

  // Boots
  const bootGeo = new THREE.SphereGeometry(0.13, 8, 8);
  const bootL = new THREE.Mesh(bootGeo, red);
  bootL.scale.set(1, 0.6, 1.3);
  bootL.position.set(-0.28, -2.45, 0.05);
  g.add(bootL);

  const bootR = new THREE.Mesh(bootGeo, red);
  bootR.scale.set(1, 0.6, 1.3);
  bootR.position.set(0.28, -2.45, 0.05);
  g.add(bootR);

  return g;
}

// ─── Buildings ──────────────────────────────────────────────────────────────

const NEON_COLORS = [0xff2266, 0x22ccff, 0xff6600, 0x44ff88, 0xaa44ff, 0xffcc00];

function spawnBuilding() {
  const w = 4 + Math.random() * 6;
  const h = 12 + Math.random() * 30;
  const d = 6 + Math.random() * 4;

  // Pick a side: left (z < 0) or right (z > 0) or center
  const side = Math.random() < 0.5 ? -1 : 1;
  const z = side * (d / 2 + 2 + Math.random() * 3);

  const geo = new THREE.BoxGeometry(w, h, d);
  const baseTone = 0.05 + Math.random() * 0.08;
  const mat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(baseTone, baseTone, baseTone + 0.03),
    shininess: 10
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(nextBuildingX + w / 2, FLOOR_Y + h / 2, z);
  scene.add(mesh);

  // Windows
  const winRows = Math.floor(h / 2.5);
  const winCols = Math.floor(w / 1.8);
  const winGeo = new THREE.PlaneGeometry(0.7, 1.0);
  for (let row = 0; row < winRows; row++) {
    for (let col = 0; col < winCols; col++) {
      const lit = Math.random() > 0.35;
      const winMat = new THREE.MeshBasicMaterial({
        color: lit
          ? new THREE.Color(0.9 + Math.random() * 0.1, 0.8 + Math.random() * 0.15, 0.4 + Math.random() * 0.3)
          : new THREE.Color(0.03, 0.03, 0.05)
      });
      const win = new THREE.Mesh(winGeo, winMat);
      const wx = -w / 2 + 1 + col * (w - 2) / Math.max(winCols - 1, 1);
      const wy = -h / 2 + 2 + row * (h - 3) / Math.max(winRows - 1, 1);
      // Front face
      win.position.set(
        mesh.position.x + wx,
        mesh.position.y + wy,
        mesh.position.z + d / 2 + 0.01
      );
      scene.add(win);
    }
  }

  // Neon accent strip on some buildings
  if (Math.random() > 0.5) {
    const neonColor = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
    const stripGeo = new THREE.BoxGeometry(w + 0.2, 0.15, 0.15);
    const stripMat = new THREE.MeshBasicMaterial({ color: neonColor });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(
      mesh.position.x,
      mesh.position.y + h * 0.2 * (Math.random() - 0.5),
      mesh.position.z + d / 2 + 0.1
    );
    scene.add(strip);

    // Glow
    const glowGeo = new THREE.BoxGeometry(w + 1, 0.6, 0.6);
    const glowMat = new THREE.MeshBasicMaterial({ color: neonColor, transparent: true, opacity: 0.08 });
    const glw = new THREE.Mesh(glowGeo, glowMat);
    glw.position.copy(strip.position);
    scene.add(glw);
  }

  // Rooftop anchor point data
  const bld = {
    x: nextBuildingX + w / 2,
    y: FLOOR_Y + h,
    z: 0,
    w, h,
    mesh
  };
  buildings.push(bld);

  nextBuildingX += w + BUILDING_GAP + Math.random() * 4;
}

// ─── Find nearest anchor ────────────────────────────────────────────────────

function findAnchor() {
  let bestDist = Infinity;
  let bestX = px + 5, bestY = py + 15;

  for (const b of buildings) {
    // Only consider buildings ahead or slightly behind, and above
    if (b.x < px - 5 || b.x > px + MAX_WEB_LEN + 5) continue;
    if (b.y < py) continue;

    const dx = b.x - px;
    const dy = b.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < bestDist && dist < MAX_WEB_LEN && dist > MIN_WEB_LEN) {
      bestDist = dist;
      bestX = b.x;
      bestY = b.y;
    }
  }

  return { x: bestX, y: bestY, dist: bestDist };
}

// ─── Input ──────────────────────────────────────────────────────────────────

let inputDown = false;

function onDown(e) {
  e.preventDefault();
  if (state !== 'playing') return;
  inputDown = true;
  attachWeb();
}

function onUp(e) {
  e.preventDefault();
  if (state !== 'playing') return;
  inputDown = false;
  detachWeb();
}

canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchend', onUp, { passive: false });

function attachWeb() {
  const anchor = findAnchor();
  if (anchor.dist > MAX_WEB_LEN) return;

  anchorX = anchor.x;
  anchorY = anchor.y;
  ropeLen = Math.sqrt((px - anchorX) ** 2 + (py - anchorY) ** 2);
  webAttached = true;
  webLine.visible = true;
  sfxWeb();
}

function detachWeb() {
  webAttached = false;
  webLine.visible = false;
  // Give a slight upward boost on release
  if (vy < 2) vy += 3;
  sfxSwing();
}

// ─── Game Logic ─────────────────────────────────────────────────────────────

function startGame() {
  state = 'playing';
  score = 0;
  px = 0; py = 18;
  vx = 8; vy = LAUNCH_VY;
  webAttached = false;
  webLine.visible = false;
  inputDown = false;

  startScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  hudEl.classList.remove('hidden');

  resumeAudio();
}

function gameOver() {
  state = 'gameOver';
  webAttached = false;
  webLine.visible = false;

  hudEl.classList.add('hidden');
  finalScore.textContent = Math.floor(score);
  overScreen.classList.remove('hidden');

  sfxFall();
}

btnPlay.addEventListener('click', startGame);
btnRetry.addEventListener('click', startGame);

// ─── Physics Update ─────────────────────────────────────────────────────────

function updatePhysics(dt) {
  if (state !== 'playing') return;

  // Cap dt to avoid physics explosion
  dt = Math.min(dt, 0.033);

  if (webAttached) {
    // Pendulum physics
    // Apply gravity
    vy -= GRAVITY * dt;

    // Update position tentatively
    let nx = px + vx * dt;
    let ny = py + vy * dt;

    // Constrain to rope length
    let dx = nx - anchorX;
    let dy = ny - anchorY;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > ropeLen) {
      // Project back onto rope circle
      dx /= dist;
      dy /= dist;
      nx = anchorX + dx * ropeLen;
      ny = anchorY + dy * ropeLen;

      // Adjust velocity: remove radial component
      const vDotR = vx * dx + vy * dy;
      if (vDotR < 0) {
        vx -= vDotR * dx;
        vy -= vDotR * dy;
      }
    }

    vx *= SWING_DAMPING;
    vy *= SWING_DAMPING;

    // Ensure forward momentum
    if (vx < 4) vx += 8 * dt;

    px = nx;
    py = ny;
  } else {
    // Free fall with gravity
    vy -= GRAVITY * dt;
    px += vx * dt;
    py += vy * dt;

    // Slight forward acceleration when falling
    if (vx < 12) vx += 2 * dt;
  }

  // Floor collision = game over
  if (py < FLOOR_Y + 1) {
    py = FLOOR_Y + 1;
    gameOver();
    return;
  }

  // Score
  score = Math.max(score, px);
  hudScore.textContent = Math.floor(score) + 'm';

  // Spawn more buildings ahead
  while (nextBuildingX < px + 100) {
    spawnBuilding();
  }
}

// ─── Render Loop ────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  updatePhysics(dt);

  // Update Spider-Man position
  spiderGroup.position.set(px, py, 0);

  // Tilt Spider-Man based on velocity
  if (state === 'playing') {
    const angle = Math.atan2(vy, vx);
    spiderGroup.rotation.z = angle * 0.3;
    // Lean forward
    spiderGroup.rotation.y = webAttached ? -0.3 : 0;
  } else {
    spiderGroup.rotation.z = 0;
    spiderGroup.rotation.y = 0;
  }

  // Update web line
  if (webAttached) {
    const positions = webLine.geometry.attributes.position;
    positions.array[0] = px;
    positions.array[1] = py + 0.5;
    positions.array[2] = 0;
    positions.array[3] = anchorX;
    positions.array[4] = anchorY;
    positions.array[5] = 0;
    positions.needsUpdate = true;
  }

  // Camera follow
  const targetCamX = px + CAM_OFFSET_X;
  const targetCamY = Math.max(py + CAM_OFFSET_Y, 15);
  camera.position.x += (targetCamX - camera.position.x) * 0.06;
  camera.position.y += (targetCamY - camera.position.y) * 0.04;
  camera.position.z = CAM_OFFSET_Z;
  camera.lookAt(px, py + 3, 0);

  renderer.render(scene, camera);
}

// ─── Resize ─────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Init ───────────────────────────────────────────────────────────────────

initScene();
animate();
