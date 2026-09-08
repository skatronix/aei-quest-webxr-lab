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
const VR_BACKGROUND = new THREE.Color(0x07090d);
scene.background = VR_BACKGROUND.clone();

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 2.4);

scene.add(new THREE.HemisphereLight(0xffffff, 0x202735, 2.0));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(2.5, 4.0, 2.5);
scene.add(keyLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4, 64),
  new THREE.MeshStandardMaterial({ color: 0x11141b, roughness: 0.96 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ---------------------------------------------------------------------------
// UI Demo 01 — Spatial Panel
//
// Teaching goal:
// 1. World-space panel: UI is ordinary Three.js geometry placed in the XR scene.
// 2. Controller ray: point at a button and press trigger/select.
// 3. Hand direct interaction: move index fingertip into a button and pinch.
// 4. State machine: idle -> hover -> pressed/activated -> idle.
//
// This branch deliberately starts from the confirmed Bubble Test 01.1 input path.
// ---------------------------------------------------------------------------

const COLORS = {
  panel: 0x151a24,
  panelEdge: 0x2b3446,
  idle: 0x263246,
  hover: 0x3c82f6,
  pressed: 0xffb84d,
  cyan: 0x62d8ff,
  pink: 0xff7ab8,
  white: 0xf5f7fb,
};

let accentIndex = 0;
const accentPalette = [0x3c82f6, 0xff5f72, 0x6adf8d, 0xffbe4a, 0xb77cff];
let animationEnabled = true;

function makeTextPlane(text, width, height, options = {}) {
  const canvasEl = document.createElement('canvas');
  canvasEl.width = options.canvasWidth || 1024;
  canvasEl.height = options.canvasHeight || 256;
  const ctx = canvasEl.getContext('2d');
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);

  function draw(nextText, subtitle = '') {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.fillStyle = options.background || 'rgba(0,0,0,0)';
    if (options.background) ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    ctx.textAlign = options.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = options.color || '#f5f7fb';
    ctx.font = `${options.weight || 700} ${options.fontSize || 54}px system-ui, sans-serif`;
    const x = options.align === 'left' ? 32 : canvasEl.width / 2;
    ctx.fillText(nextText, x, subtitle ? canvasEl.height * 0.40 : canvasEl.height * 0.50);

    if (subtitle) {
      ctx.fillStyle = options.subtitleColor || 'rgba(245,247,251,.66)';
      ctx.font = `500 ${options.subtitleSize || 30}px system-ui, sans-serif`;
      ctx.fillText(subtitle, x, canvasEl.height * 0.70);
    }

    texture.needsUpdate = true;
  }

  draw(text, options.subtitle || '');
  mesh.userData.drawText = draw;
  return mesh;
}

const panel = new THREE.Group();
panel.position.set(0, 1.48, -1.35);
scene.add(panel);

const panelBack = new THREE.Mesh(
  new THREE.BoxGeometry(1.28, 0.80, 0.045),
  new THREE.MeshStandardMaterial({
    color: COLORS.panel,
    roughness: 0.72,
    metalness: 0.0,
  })
);
panel.add(panelBack);

const panelEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(panelBack.geometry),
  new THREE.LineBasicMaterial({ color: COLORS.panelEdge, transparent: true, opacity: 0.9 })
);
panel.add(panelEdge);

const title = makeTextPlane('AEI SPATIAL UI 01', 1.05, 0.15, {
  fontSize: 58,
  weight: 800,
});
title.position.set(0, 0.265, 0.026);
panel.add(title);

const status = makeTextPlane('READY', 1.04, 0.14, {
  fontSize: 42,
  weight: 700,
  subtitle: 'controller ray + hand pinch',
  subtitleSize: 25,
});
status.position.set(0, -0.268, 0.027);
panel.add(status);

const buttonGroup = new THREE.Group();
buttonGroup.position.set(0, 0.01, 0.055);
panel.add(buttonGroup);

const buttons = [];
const buttonMeshes = [];

function createButton(label, x, action) {
  const group = new THREE.Group();
  group.position.x = x;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.075),
    new THREE.MeshStandardMaterial({
      color: COLORS.idle,
      emissive: 0x000000,
      roughness: 0.48,
    })
  );
  group.add(mesh);

  const labelPlane = makeTextPlane(label, 0.29, 0.095, {
    fontSize: 56,
    weight: 800,
  });
  labelPlane.position.z = 0.039;
  group.add(labelPlane);

  const button = {
    label,
    group,
    mesh,
    action,
    hoverInputs: new Set(),
    flash: 0,
  };
  mesh.userData.button = button;
  buttonMeshes.push(mesh);
  buttons.push(button);
  buttonGroup.add(group);
  return button;
}

const demoCube = new THREE.Mesh(
  new THREE.BoxGeometry(0.26, 0.26, 0.26),
  new THREE.MeshStandardMaterial({
    color: accentPalette[0],
    roughness: 0.32,
    metalness: 0.08,
  })
);
demoCube.position.set(0, 1.42, -2.05);
scene.add(demoCube);

createButton('COLOR', -0.39, () => {
  accentIndex = (accentIndex + 1) % accentPalette.length;
  const accent = accentPalette[accentIndex];
  demoCube.material.color.setHex(accent);
  status.userData.drawText('COLOR CHANGED', `accent ${accentIndex + 1}/${accentPalette.length}`);
});

createButton('PLAY', 0, () => {
  animationEnabled = !animationEnabled;
  status.userData.drawText(animationEnabled ? 'PLAYING' : 'PAUSED', 'demo object animation');
});

createButton('RESET', 0.39, () => {
  accentIndex = 0;
  animationEnabled = true;
  demoCube.visible = true;
  demoCube.material.color.setHex(accentPalette[0]);
  demoCube.rotation.set(0, 0, 0);
  status.userData.drawText('RESET', 'UI state returned to defaults');
});

function updateButtonVisual(button, dt) {
  button.flash = Math.max(0, button.flash - dt);
  const hovered = button.hoverInputs.size > 0;
  const targetColor = button.flash > 0 ? COLORS.pressed : hovered ? accentPalette[accentIndex] : COLORS.idle;
  button.mesh.material.color.lerp(new THREE.Color(targetColor), THREE.MathUtils.clamp(dt * 14, 0, 1));
  button.mesh.material.emissive.lerp(
    new THREE.Color(hovered || button.flash > 0 ? targetColor : 0x000000),
    THREE.MathUtils.clamp(dt * 10, 0, 1)
  );
  button.mesh.material.emissiveIntensity = hovered || button.flash > 0 ? 0.22 : 0;
  const targetZ = button.flash > 0 ? 0.78 : hovered ? 1.08 : 1.0;
  button.group.scale.z = THREE.MathUtils.lerp(button.group.scale.z, targetZ, THREE.MathUtils.clamp(dt * 18, 0, 1));
}

function activateButton(button) {
  if (!button) return;
  button.flash = 0.16;
  button.action();
}

// --- XR input: keep the proven Bubble Test 01.1 model ----------------------

const controllerState = [
  { connected: false, handedness: '—', hand: false },
  { connected: false, handedness: '—', hand: false },
];

const inputs = [];
const inputMarkers = [];
const inputRays = [];
const inputPos = [new THREE.Vector3(), new THREE.Vector3()];
const hoveredByInput = [null, null];
const previousPinch = [false, false];

const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const rayQuaternion = new THREE.Quaternion();
const tempBox = new THREE.Box3();

let currentMode = 'screen';
let session = null;

function setHover(index, button) {
  const previous = hoveredByInput[index];
  if (previous === button) return;
  if (previous) previous.hoverInputs.delete(index);
  hoveredByInput[index] = button;
  if (button) button.hoverInputs.add(index);
}

function makeInput(index) {
  const controller = renderer.xr.getController(index);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 14, 10),
    new THREE.MeshBasicMaterial({
      color: index === 0 ? COLORS.cyan : COLORS.pink,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
    })
  );
  marker.visible = false;
  marker.renderOrder = 200;
  scene.add(marker);

  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]),
    new THREE.LineBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.45 })
  );
  ray.scale.z = 1.8;
  controller.add(ray);

  controller.addEventListener('connected', (event) => {
    controllerState[index] = {
      connected: true,
      handedness: event.data?.handedness || 'unknown',
      hand: Boolean(event.data?.hand),
    };
    marker.visible = true;
    ray.visible = !controllerState[index].hand;
  });

  controller.addEventListener('disconnected', () => {
    controllerState[index] = { connected: false, handedness: '—', hand: false };
    marker.visible = false;
    ray.visible = false;
    setHover(index, null);
    previousPinch[index] = false;
  });

  controller.addEventListener('selectstart', () => {
    if (controllerState[index].connected && !controllerState[index].hand) {
      activateButton(hoveredByInput[index]);
    }
  });

  scene.add(controller);
  inputs.push(controller);
  inputMarkers.push(marker);
  inputRays.push(ray);
}

makeInput(0);
makeInput(1);

function getInputSource(index) {
  if (!session) return null;
  const handedness = controllerState[index].handedness;
  if (handedness !== 'unknown' && handedness !== '—') {
    const match = Array.from(session.inputSources).find((source) => source.handedness === handedness);
    if (match) return match;
  }
  return Array.from(session.inputSources)[index] || null;
}

function getHandJointPosition(source, jointName, frame, target) {
  if (!frame || !source?.hand) return false;
  const refSpace = renderer.xr.getReferenceSpace();
  if (!refSpace) return false;
  const joint = source.hand.get(jointName);
  if (!joint) return false;
  const pose = frame.getJointPose(joint, refSpace);
  if (!pose) return false;
  target.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
  return true;
}

function getHandPinch(source, frame, indexTip) {
  const thumbTip = new THREE.Vector3();
  if (!getHandJointPosition(source, 'thumb-tip', frame, thumbTip)) return false;
  return thumbTip.distanceTo(indexTip) < 0.030;
}

function directHandHit(point) {
  for (const mesh of buttonMeshes) {
    tempBox.setFromObject(mesh).expandByScalar(0.035);
    if (tempBox.containsPoint(point)) return mesh.userData.button;
  }
  return null;
}

function controllerRayHit(controller) {
  controller.getWorldPosition(rayOrigin);
  controller.getWorldQuaternion(rayQuaternion);
  rayDirection.set(0, 0, -1).applyQuaternion(rayQuaternion).normalize();
  raycaster.set(rayOrigin, rayDirection);
  raycaster.far = 3.0;
  const hit = raycaster.intersectObjects(buttonMeshes, false)[0];
  return hit?.object?.userData?.button || null;
}

function updateXRInput(frame) {
  for (let i = 0; i < inputs.length; i += 1) {
    if (!controllerState[i].connected) {
      setHover(i, null);
      inputMarkers[i].visible = false;
      continue;
    }

    const source = getInputSource(i);

    if (controllerState[i].hand && source?.hand) {
      const gotTip = getHandJointPosition(source, 'index-finger-tip', frame, inputPos[i]);
      if (!gotTip) {
        inputMarkers[i].visible = false;
        setHover(i, null);
        continue;
      }

      inputMarkers[i].visible = true;
      inputMarkers[i].position.copy(inputPos[i]);
      inputRays[i].visible = false;

      const hovered = directHandHit(inputPos[i]);
      setHover(i, hovered);

      const pinching = getHandPinch(source, frame, inputPos[i]);
      inputMarkers[i].scale.setScalar(pinching ? 1.55 : 1.0);
      if (pinching && !previousPinch[i] && hovered) activateButton(hovered);
      previousPinch[i] = pinching;
    } else {
      inputs[i].getWorldPosition(inputPos[i]);
      inputMarkers[i].visible = true;
      inputMarkers[i].position.copy(inputPos[i]);
      inputMarkers[i].scale.setScalar(1.0);
      inputRays[i].visible = true;
      setHover(i, controllerRayHit(inputs[i]));
      previousPinch[i] = false;
    }
  }
}

// --- XR session -------------------------------------------------------------

async function startXR(mode) {
  if (!navigator.xr || session) return;
  const isAR = mode === 'immersive-ar';

  try {
    session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking'],
    });

    currentMode = isAR ? 'MR / AR' : 'VR';
    document.body.classList.add('xr-active');
    scene.background = isAR ? null : VR_BACKGROUND.clone();
    floor.visible = !isAR;

    await renderer.xr.setSession(session);

    session.addEventListener('end', () => {
      session = null;
      currentMode = 'screen';
      document.body.classList.remove('xr-active');
      scene.background = VR_BACKGROUND.clone();
      floor.visible = true;
      for (let i = 0; i < hoveredByInput.length; i += 1) setHover(i, null);
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
    supportEl.textContent = 'WebXR unavailable here. Open the HTTPS page in Quest Browser.';
    return;
  }

  const [vrSupported, arSupported] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
  ]);

  vrButton.disabled = !vrSupported;
  arButton.disabled = !arSupported;
  supportEl.textContent = `WebXR: VR ${vrSupported ? 'YES' : 'NO'} / MR-AR ${arSupported ? 'YES' : 'NO'}`;
}

let lastFrameTime = 0;
renderer.setAnimationLoop((time, frame) => {
  const dt = lastFrameTime > 0
    ? THREE.MathUtils.clamp((time - lastFrameTime) / 1000, 0.001, 0.04)
    : 1 / 72;
  lastFrameTime = time;

  if (renderer.xr.isPresenting && frame) updateXRInput(frame);

  for (const button of buttons) updateButtonVisual(button, dt);

  if (animationEnabled) {
    demoCube.rotation.x += dt * 0.42;
    demoCube.rotation.y += dt * 0.68;
  }

  const seconds = time * 0.001;
  demoCube.position.y = 1.42 + Math.sin(seconds * 1.25) * 0.045;

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

detectSupport();
