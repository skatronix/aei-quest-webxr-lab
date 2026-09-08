import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#xr-canvas');
const supportEl = document.querySelector('#support');
const vrButton = document.querySelector('#enter-vr');
const arButton = document.querySelector('#enter-ar');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 2.4);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4, 64),
  new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.86 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

// ---------------------------------------------------------------------------
// Bubble Test 01.2 — layered translucent visual field
// Visual direction: warm, overlapping, semi-transparent organic membranes.
// Interaction model is inherited from 01.1: gentle push/deform, direct impact pop.
// ---------------------------------------------------------------------------

const FIELD_COUNT = 26;
const INPUT_RADIUS = 0.075;
const POP_IMPACT_SPEED = 0.95;
const POP_DURATION = 0.24;
const DEFORM_DECAY = 5.6;

const BOUNDS = {
  minX: -1.70,
  maxX: 1.70,
  minY: 0.42,
  maxY: 2.42,
  minZ: -2.75,
  maxZ: -0.28,
};

const PALETTE = [
  0xfff4cc,
  0xffe94f,
  0xffbe2f,
  0xff8a24,
  0xf35328,
  0xd92f25,
  0xf4e9e4,
  0xb9ad35,
  0x8f7866,
];

const fields = [];
let poppedCount = 0;
let contactCount = 0;
let frameImpactSpeed = 0;
let displayedImpactSpeed = 0;
let fpsSmoothed = 72;

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function seededWave(seed, value) {
  return Math.sin(value * (2.0 + (seed % 5) * 0.37) + seed * 1.731);
}

function makeBlobGeometry(seed) {
  const points = [];
  const count = 15;
  const phase = seed * 0.83;

  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const radial =
      0.78 +
      seededWave(seed, a + phase) * 0.16 +
      Math.sin(a * 3.0 + phase * 1.7) * 0.10;

    points.push(new THREE.Vector2(
      Math.cos(a) * radial,
      Math.sin(a) * radial * (0.72 + (seed % 4) * 0.07)
    ));
  }

  const shape = new THREE.Shape(points);
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.center();
  return geometry;
}

function makeShardGeometry(seed) {
  const length = 0.95 + (seed % 4) * 0.18;
  const width = 0.07 + (seed % 3) * 0.035;
  const shape = new THREE.Shape([
    new THREE.Vector2(-length, -width),
    new THREE.Vector2(length * 0.92, 0),
    new THREE.Vector2(-length * 0.28, width * 1.35),
  ]);
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.center();
  return geometry;
}

const blobGeometries = Array.from({ length: 6 }, (_, i) => makeBlobGeometry(i + 1));
const shardGeometries = Array.from({ length: 3 }, (_, i) => makeShardGeometry(i + 11));

function makeMembraneMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

function makeLayer(isShard = false) {
  const geometry = isShard ? randomItem(shardGeometries) : randomItem(blobGeometries);
  const baseOpacity = isShard ? randomRange(0.12, 0.24) : randomRange(0.10, 0.23);
  const material = makeMembraneMaterial(randomItem(PALETTE), baseOpacity);
  const mesh = new THREE.Mesh(geometry, material);

  const baseScale = new THREE.Vector3(
    isShard ? randomRange(0.35, 0.68) : randomRange(0.42, 0.88),
    isShard ? randomRange(0.18, 0.38) : randomRange(0.32, 0.78),
    1
  );

  mesh.scale.copy(baseScale);
  mesh.rotation.z = randomRange(-Math.PI, Math.PI);
  mesh.position.set(
    randomRange(-0.12, 0.12),
    randomRange(-0.10, 0.10),
    randomRange(-0.05, 0.05)
  );

  return {
    mesh,
    baseScale,
    baseOpacity,
    spin: randomRange(-0.15, 0.15),
    wobble: randomRange(0.35, 0.95),
    phase: randomRange(0, Math.PI * 2),
  };
}

function recolorField(field) {
  for (const layer of field.layers) {
    layer.mesh.material.color.setHex(randomItem(PALETTE));
    layer.baseOpacity = randomRange(0.10, layer.isShard ? 0.24 : 0.23);
    layer.mesh.material.opacity = layer.baseOpacity;
  }
}

function resetField(field, initial = false) {
  field.radius = randomRange(0.22, 0.42);
  field.phase = randomRange(0, Math.PI * 2);
  field.popping = false;
  field.popAge = 0;
  field.respawnTimer = 0;
  field.deform = 0;
  field.root.visible = true;
  field.root.scale.setScalar(1);

  field.root.position.set(
    randomRange(BOUNDS.minX, BOUNDS.maxX),
    randomRange(BOUNDS.minY, BOUNDS.maxY),
    randomRange(BOUNDS.minZ, BOUNDS.maxZ)
  );

  if (!initial) {
    field.root.position.y = BOUNDS.minY + randomRange(0.0, 0.45);
    recolorField(field);
  }

  field.root.rotation.set(
    randomRange(-0.52, 0.52),
    randomRange(-0.62, 0.62),
    randomRange(-Math.PI, Math.PI)
  );

  field.velocity.set(
    randomRange(-0.055, 0.055),
    randomRange(0.018, 0.065),
    randomRange(-0.045, 0.045)
  );

  field.angularVelocity.set(
    randomRange(-0.12, 0.12),
    randomRange(-0.12, 0.12),
    randomRange(-0.18, 0.18)
  );

  for (const layer of field.layers) {
    layer.mesh.visible = true;
    layer.mesh.material.opacity = layer.baseOpacity;
    layer.mesh.scale.copy(layer.baseScale);
  }
}

function createField() {
  const root = new THREE.Group();
  const layers = [];

  const layerCount = Math.random() < 0.52 ? 3 : 4;
  for (let i = 0; i < layerCount; i += 1) {
    const isShard = i === layerCount - 1 && Math.random() < 0.68;
    const layer = makeLayer(isShard);
    layer.isShard = isShard;
    root.add(layer.mesh);
    layers.push(layer);
  }

  const field = {
    root,
    layers,
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    radius: 0.3,
    phase: 0,
    deform: 0,
    popping: false,
    popAge: 0,
    respawnTimer: 0,
  };

  scene.add(root);
  resetField(field, true);
  fields.push(field);
}

for (let i = 0; i < FIELD_COUNT; i += 1) createField();

function popField(field) {
  if (field.popping || !field.root.visible) return;
  field.popping = true;
  field.popAge = 0;
  field.velocity.multiplyScalar(0.30);
  field.angularVelocity.multiplyScalar(2.4);
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

let currentMode = 'screen';
let session = null;
let lastHudUpdate = 0;
let lastFrameTime = 0;
const headPos = new THREE.Vector3();

function makeInput(index) {
  const controller = renderer.xr.getController(index);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 12, 10),
    new THREE.MeshBasicMaterial({
      color: index === 0 ? 0xfff27d : 0xff7a54,
      transparent: true,
      opacity: 0.74,
    })
  );
  marker.visible = false;
  scene.add(marker);

  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })
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
      const blend = THREE.MathUtils.clamp(dt * 12.0, 0, 1);
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

function interactWithField(field) {
  if (field.popping || !field.root.visible) return;

  for (let i = 0; i < inputs.length; i += 1) {
    if (!controllerState[i].connected) continue;

    const hitDistance = field.root.position.distanceTo(inputPos[i]);
    const contactDistance = field.radius + INPUT_RADIUS;
    if (hitDistance >= contactDistance) continue;

    contactCount += 1;

    contactNormal.copy(field.root.position).sub(inputPos[i]);
    if (contactNormal.lengthSq() < 0.000001) contactNormal.set(0, 0, 1);
    else contactNormal.normalize();

    const impactSpeed = Math.max(0, inputVelocity[i].dot(contactNormal));
    frameImpactSpeed = Math.max(frameImpactSpeed, impactSpeed);

    const penetration = contactDistance - hitDistance;
    const penetrationRatio = THREE.MathUtils.clamp(penetration / contactDistance, 0, 1);
    const deformation = THREE.MathUtils.clamp(
      impactSpeed * 0.24 + penetrationRatio * 0.42,
      0,
      0.46
    );

    field.deform = Math.max(field.deform, deformation);

    if (impactSpeed >= POP_IMPACT_SPEED) {
      popField(field);
      return;
    }

    field.velocity.addScaledVector(inputVelocity[i], 0.24);
    field.velocity.addScaledVector(contactNormal, 0.040 + penetrationRatio * 0.040);
    field.velocity.clampLength(0, 0.62);

    field.angularVelocity.x += inputVelocity[i].y * 0.028;
    field.angularVelocity.y -= inputVelocity[i].x * 0.028;
    field.angularVelocity.z += (inputVelocity[i].x - inputVelocity[i].y) * 0.018;

    field.root.position.addScaledVector(contactNormal, penetration * 0.66);
  }
}

function updateFieldVisual(field, dt, seconds) {
  const deform = field.deform;
  const pulse = 1 + deform * 0.18;
  field.root.scale.set(
    pulse,
    1 - deform * 0.13,
    1 + deform * 0.11
  );

  for (let i = 0; i < field.layers.length; i += 1) {
    const layer = field.layers[i];
    const wobble = Math.sin(seconds * layer.wobble + layer.phase + field.phase) * 0.055;
    const breathe = 1 + Math.sin(seconds * 0.58 + layer.phase) * 0.035;

    layer.mesh.rotation.z += layer.spin * dt;
    layer.mesh.rotation.x = wobble * 0.45;
    layer.mesh.rotation.y = Math.cos(seconds * 0.43 + layer.phase) * 0.08;
    layer.mesh.scale.set(
      layer.baseScale.x * breathe * (1 + deform * (0.16 + i * 0.025)),
      layer.baseScale.y * (2 - breathe) * (1 - deform * 0.08),
      1
    );
  }

  field.deform *= Math.exp(-DEFORM_DECAY * dt);
}

function updateFields(dt, time) {
  const seconds = time * 0.001;

  for (const field of fields) {
    if (!field.root.visible) {
      field.respawnTimer -= dt;
      if (field.respawnTimer <= 0) resetField(field, false);
      continue;
    }

    if (field.popping) {
      field.popAge += dt;
      const t = THREE.MathUtils.clamp(field.popAge / POP_DURATION, 0, 1);
      const pulse = 1 + Math.sin(t * Math.PI) * 0.42 + t * 0.30;
      field.root.scale.setScalar(pulse);

      for (let i = 0; i < field.layers.length; i += 1) {
        const layer = field.layers[i];
        layer.mesh.material.opacity = layer.baseOpacity * (1 - t);
        layer.mesh.rotation.z += (0.9 + i * 0.35) * dt;
        layer.mesh.position.x += Math.cos(layer.phase) * 0.16 * dt;
        layer.mesh.position.y += Math.sin(layer.phase) * 0.16 * dt;
      }

      if (t >= 1) {
        field.popping = false;
        field.root.visible = false;
        field.respawnTimer = randomRange(0.55, 1.25);
      }
      continue;
    }

    field.velocity.x += Math.sin(seconds * 0.44 + field.phase) * 0.0038 * dt;
    field.velocity.z += Math.cos(seconds * 0.37 + field.phase * 1.7) * 0.0032 * dt;
    field.velocity.y += 0.0048 * dt;

    const drag = Math.exp(-0.38 * dt);
    field.velocity.multiplyScalar(drag);
    field.root.position.addScaledVector(field.velocity, dt);

    field.root.rotation.x += field.angularVelocity.x * dt;
    field.root.rotation.y += field.angularVelocity.y * dt;
    field.root.rotation.z += field.angularVelocity.z * dt;
    field.angularVelocity.multiplyScalar(Math.exp(-0.50 * dt));

    interactWithField(field);
    updateFieldVisual(field, dt, seconds);

    const r = field.radius * 0.52;

    if (field.root.position.x < BOUNDS.minX - r) {
      field.root.position.x = BOUNDS.maxX + r;
    } else if (field.root.position.x > BOUNDS.maxX + r) {
      field.root.position.x = BOUNDS.minX - r;
    }

    if (field.root.position.z < BOUNDS.minZ - r) {
      field.root.position.z = BOUNDS.maxZ + r;
    } else if (field.root.position.z > BOUNDS.maxZ + r) {
      field.root.position.z = BOUNDS.minZ - r;
    }

    if (field.root.position.y > BOUNDS.maxY + r) {
      field.root.position.y = BOUNDS.minY - r;
      field.root.position.x = randomRange(BOUNDS.minX, BOUNDS.maxX);
      field.root.position.z = randomRange(BOUNDS.minZ, BOUNDS.maxZ);
      field.velocity.y = randomRange(0.02, 0.065);
    }
  }
}

// --- Diagnostic HUD ---------------------------------------------------------

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024;
hudCanvas.height = 520;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;

const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(1.28, 0.65),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, depthTest: false })
);
hud.position.set(0, 1.82, -2.64);
hud.renderOrder = 100;
scene.add(hud);

function drawHud(time) {
  if (time - lastHudUpdate < 120) return;
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

  const alive = fields.filter((field) => field.root.visible).length;

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = 'rgba(0,0,0,.64)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.strokeStyle = 'rgba(255,217,91,.46)';
  hudCtx.lineWidth = 3;
  hudCtx.strokeRect(2, 2, hudCanvas.width - 4, hudCanvas.height - 4);

  hudCtx.fillStyle = '#fff4ca';
  hudCtx.font = '700 34px system-ui, sans-serif';
  hudCtx.fillText('AEI QUEST — BUBBLE TEST 01.2', 40, 58);

  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = '23px ui-monospace, monospace';
  const lines = [
    `mode: ${currentMode}   XR: ${renderer.xr.isPresenting ? 'ACTIVE' : 'screen'}   fps: ${fpsSmoothed.toFixed(0)}`,
    `controllers: ${controllerCount}   hands: ${handCount}`,
    `input 0 ${controllerState[0].handedness}: ${inputSpeed[0].toFixed(2)} m/s`,
    `input 1 ${controllerState[1].handedness}: ${inputSpeed[1].toFixed(2)} m/s`,
    `impact: ${displayedImpactSpeed.toFixed(2)} m/s   pop: ${POP_IMPACT_SPEED.toFixed(2)} m/s`,
    `field: ${alive}/${FIELD_COUNT}   popped: ${poppedCount}   contacts: ${contactCount}`,
    `slow touch = bend / carry   direct fast poke = pop`,
  ];

  lines.forEach((line, i) => hudCtx.fillText(line, 40, 112 + i * 50));
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
    scene.background = isAR ? null : new THREE.Color(0x000000);
    floor.visible = !isAR;
    await renderer.xr.setSession(session);

    inputHasPrevious.fill(false);
    inputSpeed.fill(0);

    session.addEventListener('end', () => {
      session = null;
      currentMode = 'screen';
      document.body.classList.remove('xr-active');
      scene.background = new THREE.Color(0x000000);
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

  const instantFps = 1 / dt;
  fpsSmoothed = THREE.MathUtils.lerp(fpsSmoothed, instantFps, 0.055);

  frameImpactSpeed = 0;
  updateInputKinematics(dt, frame);
  updateFields(dt, time);
  displayedImpactSpeed = THREE.MathUtils.lerp(
    displayedImpactSpeed,
    frameImpactSpeed,
    frameImpactSpeed > displayedImpactSpeed ? 0.42 : 0.10
  );

  drawHud(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

detectSupport();
