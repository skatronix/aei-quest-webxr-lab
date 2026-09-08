import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#xr-canvas');
const supportEl = document.querySelector('#support');
const vrButton = document.querySelector('#enter-vr');
const arButton = document.querySelector('#enter-ar');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070707);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 2.4);

scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(2, 4, 2);
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4, 64),
  new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

// --- Bubble field -----------------------------------------------------------
const BUBBLE_COUNT = 30;
const POP_SPEED = 1.35; // m/s, tuned conservatively for Quest hand-tracking jitter
const INPUT_RADIUS = 0.075;
const POP_DURATION = 0.16;
const BOUNDS = {
  minX: -1.55,
  maxX: 1.55,
  minY: 0.45,
  maxY: 2.35,
  minZ: -2.35,
  maxZ: -0.20,
};

const bubbleGeometry = new THREE.SphereGeometry(1, 24, 16);
const bubbles = [];
let poppedCount = 0;
let contactCount = 0;

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function makeBubbleMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(Math.random(), 0.22, 0.88),
    transparent: true,
    opacity: 0.20,
    roughness: 0.04,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Modern Three.js supports iridescence; older builds simply ignore these fields.
  material.iridescence = 0.9;
  material.iridescenceIOR = 1.3;
  material.iridescenceThicknessRange = [120, 520];
  return material;
}

function resetBubble(bubble, initial = false) {
  bubble.radius = randomRange(0.065, 0.145);
  bubble.baseOpacity = randomRange(0.15, 0.25);
  bubble.phase = Math.random() * Math.PI * 2;
  bubble.popping = false;
  bubble.popAge = 0;
  bubble.respawnTimer = 0;
  bubble.mesh.visible = true;
  bubble.mesh.material.opacity = bubble.baseOpacity;
  bubble.mesh.scale.setScalar(bubble.radius);
  bubble.mesh.position.set(
    randomRange(BOUNDS.minX, BOUNDS.maxX),
    randomRange(BOUNDS.minY, BOUNDS.maxY),
    randomRange(BOUNDS.minZ, BOUNDS.maxZ)
  );
  bubble.velocity.set(
    randomRange(-0.045, 0.045),
    randomRange(0.015, 0.055),
    randomRange(-0.035, 0.035)
  );

  if (!initial) {
    bubble.mesh.position.y = BOUNDS.minY + randomRange(0.0, 0.30);
  }
}

function createBubble() {
  const mesh = new THREE.Mesh(bubbleGeometry, makeBubbleMaterial());
  const bubble = {
    mesh,
    velocity: new THREE.Vector3(),
    radius: 0.1,
    baseOpacity: 0.2,
    phase: 0,
    popping: false,
    popAge: 0,
    respawnTimer: 0,
  };
  scene.add(mesh);
  resetBubble(bubble, true);
  bubbles.push(bubble);
}

for (let i = 0; i < BUBBLE_COUNT; i += 1) createBubble();

function popBubble(bubble) {
  if (bubble.popping || !bubble.mesh.visible) return;
  bubble.popping = true;
  bubble.popAge = 0;
  bubble.velocity.multiplyScalar(0.18);
  poppedCount += 1;
}

// --- XR input ---------------------------------------------------------------
const controllerState = [
  { connected: false, handedness: '—', hand: false },
  { connected: false, handedness: '—', hand: false },
];

const inputs = [];
const inputMarkers = [];
const inputRays = [];
const inputPos = [new THREE.Vector3(), new THREE.Vector3()];
const previousInputPos = [new THREE.Vector3(), new THREE.Vector3()];
const inputVelocity = [new THREE.Vector3(), new THREE.Vector3()];
const inputSpeed = [0, 0];
const inputHasPrevious = [false, false];
const rawVelocity = new THREE.Vector3();
const contactNormal = new THREE.Vector3();
const pairDelta = new THREE.Vector3();

let currentMode = 'screen';
let session = null;
let lastHudUpdate = 0;
let lastFrameTime = 0;
const headPos = new THREE.Vector3();

function makeInput(index) {
  const controller = renderer.xr.getController(index);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 20, 14),
    new THREE.MeshBasicMaterial({ color: index === 0 ? 0x8fd3ff : 0xff9dc7 })
  );
  marker.visible = false;
  scene.add(marker);

  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
  );
  ray.scale.z = 1.25;
  controller.add(ray);

  controller.addEventListener('connected', (event) => {
    controllerState[index] = {
      connected: true,
      handedness: event.data?.handedness || 'unknown',
      hand: Boolean(event.data?.hand),
    };
    ray.visible = !controllerState[index].hand;
    marker.visible = true;
    inputHasPrevious[index] = false;
  });

  controller.addEventListener('disconnected', () => {
    controllerState[index] = { connected: false, handedness: '—', hand: false };
    marker.visible = false;
    inputSpeed[index] = 0;
    inputVelocity[index].set(0, 0, 0);
    inputHasPrevious[index] = false;
  });

  scene.add(controller);
  inputs.push(controller);
  inputMarkers.push(marker);
  inputRays.push(ray);
}

makeInput(0);
makeInput(1);

function getHandTipPosition(index, frame, target) {
  if (!frame || !session || !controllerState[index].hand) return false;

  const refSpace = renderer.xr.getReferenceSpace();
  if (!refSpace) return false;

  const handedness = controllerState[index].handedness;
  const source = Array.from(session.inputSources).find(
    (item) => item.hand && item.handedness === handedness
  );
  if (!source?.hand) return false;

  const joint = source.hand.get('index-finger-tip');
  if (!joint) return false;

  const pose = frame.getJointPose(joint, refSpace);
  if (!pose) return false;

  target.set(
    pose.transform.position.x,
    pose.transform.position.y,
    pose.transform.position.z
  );
  return true;
}

function updateInputKinematics(dt, frame) {
  for (let i = 0; i < inputs.length; i += 1) {
    if (!controllerState[i].connected) {
      inputMarkers[i].visible = false;
      continue;
    }

    const gotHandTip = getHandTipPosition(i, frame, inputPos[i]);
    if (!gotHandTip) inputs[i].getWorldPosition(inputPos[i]);

    inputMarkers[i].visible = true;
    inputMarkers[i].position.copy(inputPos[i]);

    if (inputHasPrevious[i] && dt > 0.0001) {
      rawVelocity.copy(inputPos[i]).sub(previousInputPos[i]).multiplyScalar(1 / dt);
      const blend = THREE.MathUtils.clamp(dt * 13.0, 0.0, 1.0);
      inputVelocity[i].lerp(rawVelocity, blend);
      inputSpeed[i] = inputVelocity[i].length();
    } else {
      inputVelocity[i].set(0, 0, 0);
      inputSpeed[i] = 0;
      inputHasPrevious[i] = true;
    }

    previousInputPos[i].copy(inputPos[i]);
  }
}

function interactWithInputs(bubble) {
  if (bubble.popping || !bubble.mesh.visible) return;

  for (let i = 0; i < inputs.length; i += 1) {
    if (!controllerState[i].connected) continue;

    const hitDistance = bubble.mesh.position.distanceTo(inputPos[i]);
    const contactDistance = bubble.radius + INPUT_RADIUS;
    if (hitDistance >= contactDistance) continue;

    contactCount += 1;

    if (inputSpeed[i] >= POP_SPEED) {
      popBubble(bubble);
      return;
    }

    contactNormal.copy(bubble.mesh.position).sub(inputPos[i]);
    if (contactNormal.lengthSq() < 0.000001) {
      contactNormal.set(0, 1, 0);
    } else {
      contactNormal.normalize();
    }

    // Gentle contact: carry some hand velocity into the bubble, then separate surfaces.
    bubble.velocity.addScaledVector(inputVelocity[i], 0.32);
    bubble.velocity.addScaledVector(contactNormal, 0.055);
    bubble.velocity.clampLength(0, 0.62);

    const penetration = contactDistance - hitDistance;
    bubble.mesh.position.addScaledVector(contactNormal, penetration * 0.70);
  }
}

function updateBubblePairs() {
  for (let i = 0; i < bubbles.length; i += 1) {
    const a = bubbles[i];
    if (!a.mesh.visible || a.popping) continue;

    for (let j = i + 1; j < bubbles.length; j += 1) {
      const b = bubbles[j];
      if (!b.mesh.visible || b.popping) continue;

      pairDelta.copy(b.mesh.position).sub(a.mesh.position);
      const distance = pairDelta.length();
      const minDistance = (a.radius + b.radius) * 0.88;
      if (distance <= 0.0001 || distance >= minDistance) continue;

      pairDelta.multiplyScalar(1 / distance);
      const correction = (minDistance - distance) * 0.35;
      a.mesh.position.addScaledVector(pairDelta, -correction);
      b.mesh.position.addScaledVector(pairDelta, correction);
      a.velocity.addScaledVector(pairDelta, -0.012);
      b.velocity.addScaledVector(pairDelta, 0.012);
    }
  }
}

function updateBubbles(dt, time) {
  for (const bubble of bubbles) {
    if (!bubble.mesh.visible) {
      bubble.respawnTimer -= dt;
      if (bubble.respawnTimer <= 0) resetBubble(bubble, false);
      continue;
    }

    if (bubble.popping) {
      bubble.popAge += dt;
      const t = THREE.MathUtils.clamp(bubble.popAge / POP_DURATION, 0, 1);
      const membranePulse = 1 + Math.sin(t * Math.PI) * 0.65;
      bubble.mesh.scale.setScalar(bubble.radius * membranePulse);
      bubble.mesh.material.opacity = bubble.baseOpacity * (1 - t);

      if (t >= 1) {
        bubble.popping = false;
        bubble.mesh.visible = false;
        bubble.respawnTimer = randomRange(0.45, 1.10);
      }
      continue;
    }

    const seconds = time * 0.001;
    bubble.velocity.x += Math.sin(seconds * 0.58 + bubble.phase) * 0.0035 * dt;
    bubble.velocity.z += Math.cos(seconds * 0.44 + bubble.phase * 1.7) * 0.0028 * dt;
    bubble.velocity.y += 0.006 * dt;

    const drag = Math.exp(-0.42 * dt);
    bubble.velocity.multiplyScalar(drag);
    bubble.mesh.position.addScaledVector(bubble.velocity, dt);

    interactWithInputs(bubble);

    // Soft room bounds. Top bubbles wrap back from below to maintain a living field.
    if (bubble.mesh.position.x < BOUNDS.minX + bubble.radius) {
      bubble.mesh.position.x = BOUNDS.minX + bubble.radius;
      bubble.velocity.x = Math.abs(bubble.velocity.x) * 0.7;
    } else if (bubble.mesh.position.x > BOUNDS.maxX - bubble.radius) {
      bubble.mesh.position.x = BOUNDS.maxX - bubble.radius;
      bubble.velocity.x = -Math.abs(bubble.velocity.x) * 0.7;
    }

    if (bubble.mesh.position.z < BOUNDS.minZ + bubble.radius) {
      bubble.mesh.position.z = BOUNDS.minZ + bubble.radius;
      bubble.velocity.z = Math.abs(bubble.velocity.z) * 0.7;
    } else if (bubble.mesh.position.z > BOUNDS.maxZ - bubble.radius) {
      bubble.mesh.position.z = BOUNDS.maxZ - bubble.radius;
      bubble.velocity.z = -Math.abs(bubble.velocity.z) * 0.7;
    }

    if (bubble.mesh.position.y > BOUNDS.maxY + bubble.radius) {
      bubble.mesh.position.y = BOUNDS.minY - bubble.radius;
      bubble.mesh.position.x = randomRange(BOUNDS.minX, BOUNDS.maxX);
      bubble.mesh.position.z = randomRange(BOUNDS.minZ, BOUNDS.maxZ);
      bubble.velocity.y = randomRange(0.02, 0.055);
    } else if (bubble.mesh.position.y < BOUNDS.minY - bubble.radius) {
      bubble.mesh.position.y = BOUNDS.minY + bubble.radius;
      bubble.velocity.y = Math.abs(bubble.velocity.y) * 0.7;
    }
  }

  updateBubblePairs();
}

// --- Diagnostic HUD ---------------------------------------------------------
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024;
hudCanvas.height = 600;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;
const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(1.35, 0.79),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, depthTest: false })
);
hud.position.set(0, 1.78, -2.48);
hud.renderOrder = 100;
scene.add(hud);

function drawHud(time) {
  if (time - lastHudUpdate < 100) return;
  lastHudUpdate = time;

  const xrCamera = renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera;
  xrCamera.getWorldPosition(headPos);

  let handCount = 0;
  let controllerCount = 0;
  if (session) {
    for (const source of session.inputSources) {
      if (source.hand) handCount += 1;
      else controllerCount += 1;
    }
  }

  const alive = bubbles.filter((bubble) => bubble.mesh.visible).length;

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = 'rgba(5,5,5,.80)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.strokeStyle = 'rgba(255,255,255,.28)';
  hudCtx.lineWidth = 3;
  hudCtx.strokeRect(2, 2, hudCanvas.width - 4, hudCanvas.height - 4);

  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = '700 38px system-ui, sans-serif';
  hudCtx.fillText('AEI QUEST — BUBBLE TEST 01', 42, 62);

  hudCtx.font = '24px ui-monospace, monospace';
  const fmt = (v) => `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}`;
  const lines = [
    `mode: ${currentMode}   XR: ${renderer.xr.isPresenting ? 'ACTIVE' : 'screen'}`,
    `head xyz: ${fmt(headPos)}`,
    `controllers: ${controllerCount}   hands: ${handCount}`,
    `input 0 ${controllerState[0].handedness}: ${inputSpeed[0].toFixed(2)} m/s`,
    `input 1 ${controllerState[1].handedness}: ${inputSpeed[1].toFixed(2)} m/s`,
    `bubbles: ${alive}/${BUBBLE_COUNT}   popped: ${poppedCount}`,
    `contacts: ${contactCount}   pop threshold: ${POP_SPEED.toFixed(2)} m/s`,
    `slow touch = push   fast poke = pop`,
  ];

  lines.forEach((line, i) => hudCtx.fillText(line, 42, 116 + i * 49));
  hudTexture.needsUpdate = true;
}

// --- XR session -------------------------------------------------------------
async function startXR(mode) {
  if (!navigator.xr || session) return;

  const isAR = mode === 'immersive-ar';
  const init = {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['bounded-floor', 'hand-tracking'],
  };

  try {
    session = await navigator.xr.requestSession(mode, init);
    currentMode = isAR ? 'MR / AR' : 'VR';
    document.body.classList.add('xr-active');
    scene.background = isAR ? null : new THREE.Color(0x070707);
    floor.visible = !isAR;
    await renderer.xr.setSession(session);

    inputHasPrevious.fill(false);
    inputSpeed.fill(0);

    session.addEventListener('end', () => {
      session = null;
      currentMode = 'screen';
      document.body.classList.remove('xr-active');
      scene.background = new THREE.Color(0x070707);
      floor.visible = true;
      inputHasPrevious.fill(false);
    }, { once: true });
  } catch (error) {
    console.error(error);
    supportEl.textContent = `Could not start ${mode}: ${error.message}`;
  }
}

vrButton.addEventListener('click', () => startXR('immersive-vr'));
arButton.addEventListener('click', () => startXR('immersive-ar'));

async function detectSupport() {
  if (!navigator.xr) {
    supportEl.textContent = 'WebXR API not available in this browser/context. Use HTTPS in Quest Browser.';
    return;
  }

  const [vr, ar] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
  ]);

  vrButton.disabled = !vr;
  arButton.disabled = !ar;
  supportEl.textContent = `WebXR: VR ${vr ? 'YES' : 'NO'} / MR-AR ${ar ? 'YES' : 'NO'}`;
}

renderer.setAnimationLoop((time, frame) => {
  const dt = lastFrameTime > 0
    ? THREE.MathUtils.clamp((time - lastFrameTime) / 1000, 0.001, 0.035)
    : 1 / 72;
  lastFrameTime = time;

  updateInputKinematics(dt, frame);
  updateBubbles(dt, time);
  drawHud(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

detectSupport();
