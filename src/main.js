import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#xr-canvas');
const supportEl = document.querySelector('#support');
const vrButton = document.querySelector('#enter-vr');
const arButton = document.querySelector('#enter-ar');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const VR_BACKGROUND = 0xf4f3ef;
const scene = new THREE.Scene();
scene.background = new THREE.Color(VR_BACKGROUND);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.55, 3.0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x707070, 2.25));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(2.5, 4.5, 3.5);
scene.add(key);

// --- Orbital sphere network -------------------------------------------------
const PALETTE = [0x3f73b8, 0xf03548, 0xffbf35, 0xf4ddb1, 0xffffff];
const BLACK = 0x050505;
const NODE_COUNT_TARGET = 19;
const ROOT_SPIN = 0.11;
const HAND_INFLUENCE_RADIUS = 0.42;

const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
const nodes = [];
const branchPivots = [];
const tmpWorld = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

let linkCount = 0;
let fpsSmoothed = 72;
let lastFrameTime = 0;
let lastHudUpdate = 0;
let currentMode = 'screen';
let session = null;
const headPos = new THREE.Vector3();

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function makeOutlinedSphere(radius, color, opacity = 0.92) {
  const group = new THREE.Group();

  const outline = new THREE.Mesh(
    sphereGeometry,
    new THREE.MeshBasicMaterial({ color: BLACK, side: THREE.BackSide })
  );
  outline.scale.setScalar(radius * 1.035);
  group.add(outline);

  const body = new THREE.Mesh(
    sphereGeometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.0,
      transparent: opacity < 1,
      opacity,
    })
  );
  body.scale.setScalar(radius);
  group.add(body);

  return { group, body };
}

function makeNode(radius, shellColor, coreColor, coreScale = 0.34) {
  const root = new THREE.Group();

  const shell = makeOutlinedSphere(radius, shellColor, shellColor === 0xffffff ? 0.26 : 0.84);
  root.add(shell.group);

  const coreRadius = radius * coreScale;
  const core = makeOutlinedSphere(coreRadius, coreColor, 0.98);
  root.add(core.group);

  const node = {
    root,
    shell: shell.body,
    core: core.body,
    radius,
    selfAxis: new THREE.Vector3(
      randomRange(-1, 1),
      randomRange(-1, 1),
      randomRange(-1, 1)
    ).normalize(),
    selfSpeed: randomRange(-0.9, 0.9),
    impulse: 0,
  };

  nodes.push(node);
  return node;
}

function makeConnector(length, thickness = 0.0075) {
  const geometry = new THREE.CylinderGeometry(thickness, thickness, length, 8, 1, false);
  const material = new THREE.MeshBasicMaterial({ color: BLACK });
  const line = new THREE.Mesh(geometry, material);
  line.rotation.z = -Math.PI / 2;
  line.position.x = length * 0.5;
  return line;
}

function addChild(parentNode, config) {
  const pivot = new THREE.Group();
  parentNode.root.add(pivot);

  const axis = new THREE.Vector3(...config.axis).normalize();
  pivot.userData.axis = axis;
  pivot.userData.speed = config.orbitSpeed;
  pivot.userData.phase = config.phase ?? randomRange(0, Math.PI * 2);
  pivot.userData.wobble = config.wobble ?? randomRange(0.08, 0.28);
  pivot.setRotationFromAxisAngle(axis, pivot.userData.phase);

  const connector = makeConnector(config.distance, Math.max(0.004, config.radius * 0.055));
  pivot.add(connector);
  linkCount += 1;

  const child = makeNode(config.radius, config.shell, config.core, config.coreScale ?? 0.34);
  child.root.position.set(config.distance, 0, 0);
  pivot.add(child.root);

  branchPivots.push(pivot);
  return child;
}

const field = new THREE.Group();
field.position.set(0, 1.52, -1.55);
field.rotation.set(-0.08, 0.12, -0.08);
scene.add(field);

const root = makeNode(0.32, 0x3f73b8, 0x050505, 0.36);
field.add(root.root);

const primarySpecs = [
  { distance: 0.82, radius: 0.23, shell: 0xf03548, core: 0xf4ddb1, orbitSpeed: 0.34, axis: [0.2, 0.9, 0.4], phase: 0.2 },
  { distance: 0.92, radius: 0.21, shell: 0xf4ddb1, core: 0xf03548, orbitSpeed: -0.27, axis: [-0.6, 0.7, 0.2], phase: 1.9 },
  { distance: 0.77, radius: 0.19, shell: 0xffbf35, core: 0xffffff, orbitSpeed: 0.42, axis: [0.8, 0.2, 0.6], phase: 3.2 },
  { distance: 0.88, radius: 0.18, shell: 0x3f73b8, core: 0xffbf35, orbitSpeed: -0.31, axis: [0.3, -0.5, 0.8], phase: 4.8 },
];

const primaries = primarySpecs.map((spec) => addChild(root, spec));

const secondaryCombos = [
  [0x3f73b8, 0xf03548],
  [0xffbf35, 0x050505],
  [0xffffff, 0xf4ddb1],
  [0xf03548, 0xffbf35],
  [0xf4ddb1, 0x3f73b8],
];

primaries.forEach((parent, parentIndex) => {
  const childCount = parentIndex === 0 ? 4 : 3;
  for (let i = 0; i < childCount; i += 1) {
    const combo = secondaryCombos[(parentIndex * 2 + i) % secondaryCombos.length];
    const radius = randomRange(0.075, 0.115);
    addChild(parent, {
      distance: parent.radius + randomRange(0.22, 0.38),
      radius,
      shell: combo[0],
      core: combo[1],
      coreScale: randomRange(0.28, 0.42),
      orbitSpeed: randomRange(-0.85, 0.85),
      axis: [randomRange(-1, 1), randomRange(-1, 1), randomRange(-1, 1)],
      phase: randomRange(0, Math.PI * 2),
      wobble: randomRange(0.04, 0.18),
    });
  }
});

for (let i = 5; i < Math.min(nodes.length, NODE_COUNT_TARGET - 1); i += 3) {
  const parent = nodes[i];
  const combo = pick(secondaryCombos);
  addChild(parent, {
    distance: parent.radius + randomRange(0.16, 0.24),
    radius: randomRange(0.045, 0.070),
    shell: combo[0],
    core: combo[1],
    coreScale: 0.34,
    orbitSpeed: randomRange(-1.15, 1.15),
    axis: [randomRange(-1, 1), randomRange(-1, 1), randomRange(-1, 1)],
    phase: randomRange(0, Math.PI * 2),
    wobble: 0.06,
  });
}

// --- XR input ---------------------------------------------------------------
const controllerState = [
  { connected: false, handedness: '—', hand: false },
  { connected: false, handedness: '—', hand: false },
];
const inputs = [];
const inputMarkers = [];
const inputPos = [new THREE.Vector3(), new THREE.Vector3()];

function makeInput(index) {
  const controller = renderer.xr.getController(index);
  scene.add(controller);
  inputs.push(controller);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 14, 10),
    new THREE.MeshBasicMaterial({ color: index === 0 ? 0x3f73b8 : 0xf03548 })
  );
  marker.visible = false;
  scene.add(marker);
  inputMarkers.push(marker);

  controller.addEventListener('connected', (event) => {
    controllerState[index] = {
      connected: true,
      handedness: event.data?.handedness || 'unknown',
      hand: Boolean(event.data?.hand),
    };
    marker.visible = true;
  });

  controller.addEventListener('disconnected', () => {
    controllerState[index] = { connected: false, handedness: '—', hand: false };
    marker.visible = false;
  });
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
  const joint = source?.hand?.get('index-finger-tip');
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

function updateInputs(frame) {
  for (let i = 0; i < inputs.length; i += 1) {
    if (!controllerState[i].connected) {
      inputMarkers[i].visible = false;
      continue;
    }

    const gotHandTip = getHandTipPosition(i, frame, inputPos[i]);
    if (!gotHandTip) inputs[i].getWorldPosition(inputPos[i]);
    inputMarkers[i].visible = true;
    inputMarkers[i].position.copy(inputPos[i]);
  }
}

function applyHandInfluence(dt) {
  for (const node of nodes) {
    node.root.getWorldPosition(tmpWorld);

    for (let i = 0; i < inputPos.length; i += 1) {
      if (!controllerState[i].connected) continue;
      tmpDelta.copy(tmpWorld).sub(inputPos[i]);
      const distance = tmpDelta.length();
      if (distance >= HAND_INFLUENCE_RADIUS) continue;

      const strength = 1 - distance / HAND_INFLUENCE_RADIUS;
      node.impulse += strength * dt * 7.0;
    }
  }
}

function updateNetwork(dt, seconds) {
  field.rotation.y += ROOT_SPIN * dt;
  field.rotation.x = -0.08 + Math.sin(seconds * 0.21) * 0.055;

  for (const pivot of branchPivots) {
    const speed = pivot.userData.speed;
    pivot.rotateOnAxis(pivot.userData.axis, speed * dt);
    const wobble = Math.sin(seconds * 0.63 + pivot.userData.phase) * pivot.userData.wobble * dt;
    pivot.rotateX(wobble);
  }

  for (const node of nodes) {
    const spin = node.selfSpeed + node.impulse * 1.8;
    node.root.rotateOnAxis(node.selfAxis, spin * dt);
    node.impulse *= Math.exp(-3.3 * dt);
  }
}

// --- HUD --------------------------------------------------------------------
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 900;
hudCanvas.height = 360;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;
const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(1.28, 0.51),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, depthTest: false })
);
hud.position.set(0, 2.18, -2.55);
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

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = 'rgba(255,255,255,.86)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.strokeStyle = '#111';
  hudCtx.lineWidth = 3;
  hudCtx.strokeRect(2, 2, hudCanvas.width - 4, hudCanvas.height - 4);

  hudCtx.fillStyle = '#050505';
  hudCtx.font = '700 34px system-ui, sans-serif';
  hudCtx.fillText('AEI QUEST — ORBITAL SPHERE NETWORK 01', 34, 54);
  hudCtx.font = '23px ui-monospace, monospace';
  const lines = [
    `mode: ${currentMode}   XR: ${renderer.xr.isPresenting ? 'ACTIVE' : 'screen'}   FPS: ${fpsSmoothed.toFixed(0)}`,
    `nodes: ${nodes.length}   links: ${linkCount}`,
    `controllers: ${controllerCount}   hands: ${handCount}`,
    `self-spin + parent-origin orbit + center-to-center links`,
    `hand proximity adds spin impulse`,
  ];
  lines.forEach((line, i) => hudCtx.fillText(line, 34, 105 + i * 48));
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
    scene.background = isAR ? null : new THREE.Color(VR_BACKGROUND);
    await renderer.xr.setSession(session);

    session.addEventListener('end', () => {
      session = null;
      currentMode = 'screen';
      document.body.classList.remove('xr-active');
      scene.background = new THREE.Color(VR_BACKGROUND);
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
  fpsSmoothed = THREE.MathUtils.lerp(fpsSmoothed, instantFps, 0.05);
  const seconds = time * 0.001;

  updateInputs(frame);
  applyHandInfluence(dt);
  updateNetwork(dt, seconds);
  drawHud(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

detectSupport();
