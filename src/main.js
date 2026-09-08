import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#xr-canvas');
const supportEl = document.querySelector('#support');
const networkEl = document.querySelector('#network');
const vrButton = document.querySelector('#enter-vr');
const arButton = document.querySelector('#enter-ar');
const connectButton = document.querySelector('#connect-ws');
const bridgeInput = document.querySelector('#bridge-url');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090d);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 2.2);

scene.add(new THREE.HemisphereLight(0xffffff, 0x202735, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(2.5, 4, 2.5);
scene.add(keyLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4, 64),
  new THREE.MeshStandardMaterial({ color: 0x11141b, roughness: 0.96 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const COLORS = {
  panel: 0x151a24,
  edge: 0x344056,
  track: 0x263246,
  knob: 0x4da6ff,
  active: 0xffbd59,
  white: 0xf5f7fb,
  cyan: 0x62d8ff,
  pink: 0xff7ab8,
  ok: '#73e49a',
  warn: '#ffcc66',
};

function makeTextPlane(text, width, height, options = {}) {
  const c = document.createElement('canvas');
  c.width = options.canvasWidth || 1024;
  c.height = options.canvasHeight || 256;
  const ctx = c.getContext('2d');
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);

  const draw = (nextText, subtitle = '') => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = options.color || '#f5f7fb';
    ctx.font = `${options.weight || 700} ${options.fontSize || 54}px system-ui, sans-serif`;
    ctx.fillText(nextText, c.width / 2, subtitle ? c.height * 0.40 : c.height * 0.50);
    if (subtitle) {
      ctx.fillStyle = options.subtitleColor || 'rgba(245,247,251,.62)';
      ctx.font = `500 ${options.subtitleSize || 28}px system-ui, sans-serif`;
      ctx.fillText(subtitle, c.width / 2, c.height * 0.72);
    }
    texture.needsUpdate = true;
  };

  draw(text, options.subtitle || '');
  mesh.userData.drawText = draw;
  return mesh;
}

// ---------------------------------------------------------------------------
// CONTROL DEMO 01 — XR OSC FADER
// World-locked panel + a single normalized control value (0..1).
// ---------------------------------------------------------------------------

const panel = new THREE.Group();
panel.position.set(0, 1.47, -1.25);
scene.add(panel);

const panelBack = new THREE.Mesh(
  new THREE.BoxGeometry(0.82, 1.08, 0.05),
  new THREE.MeshStandardMaterial({ color: COLORS.panel, roughness: 0.72 })
);
panel.add(panelBack);

const panelEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(panelBack.geometry),
  new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.9 })
);
panel.add(panelEdge);

const title = makeTextPlane('AEI OSC FADER 01', 0.68, 0.12, { fontSize: 56, weight: 800 });
title.position.set(0, 0.425, 0.029);
panel.add(title);

const valueLabel = makeTextPlane('0.500', 0.52, 0.16, { fontSize: 88, weight: 800, subtitle: '/aei/fader/1' });
valueLabel.position.set(0, -0.405, 0.031);
panel.add(valueLabel);

const networkLabel = makeTextPlane('WS OFFLINE', 0.58, 0.10, { fontSize: 38, weight: 700 });
networkLabel.position.set(0, 0.315, 0.031);
panel.add(networkLabel);

const track = new THREE.Mesh(
  new THREE.BoxGeometry(0.105, 0.56, 0.06),
  new THREE.MeshStandardMaterial({ color: COLORS.track, roughness: 0.48 })
);
track.position.set(0, -0.015, 0.055);
panel.add(track);

const knob = new THREE.Mesh(
  new THREE.BoxGeometry(0.30, 0.095, 0.09),
  new THREE.MeshStandardMaterial({ color: COLORS.knob, emissive: COLORS.knob, emissiveIntensity: 0.12, roughness: 0.38 })
);
knob.position.z = 0.095;
panel.add(knob);

const TRACK_MIN_Y = -0.285;
const TRACK_MAX_Y = 0.255;
let faderValue = 0.5;
let lastSentValue = Number.NaN;
let lastSendMs = 0;
const SEND_INTERVAL_MS = 33; // ~30 Hz: smooth enough for control, modest network load.

function setFaderValue(next, source = 'local') {
  faderValue = THREE.MathUtils.clamp(next, 0, 1);
  knob.position.y = THREE.MathUtils.lerp(TRACK_MIN_Y, TRACK_MAX_Y, faderValue);
  valueLabel.userData.drawText(faderValue.toFixed(3), '/aei/fader/1');
  if (source !== 'remote') queueFaderSend();
}
setFaderValue(0.5);

// --- WebSocket --------------------------------------------------------------
let socket = null;
let wsState = 'offline';
let latestRttMs = null;
let pendingAckSentAt = 0;

function normalizeBridgeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  return `wss://${trimmed}`;
}

function setWsState(state, detail = '') {
  wsState = state;
  const suffix = latestRttMs == null ? '' : ` • RTT ${latestRttMs.toFixed(1)} ms`;
  networkLabel.userData.drawText(
    state === 'open' ? 'WS CONNECTED' : state === 'connecting' ? 'WS CONNECTING' : 'WS OFFLINE',
    `${detail}${suffix}`.trim()
  );
  networkEl.textContent = `WebSocket: ${state}${detail ? ` — ${detail}` : ''}${suffix}`;
}

function connectBridge() {
  const url = normalizeBridgeUrl(bridgeInput.value);
  if (!url) {
    setWsState('offline', 'enter Mac bridge URL');
    return;
  }
  if (location.protocol === 'https:' && url.startsWith('ws://')) {
    setWsState('offline', 'HTTPS page requires wss://');
    return;
  }

  localStorage.setItem('aei-quest-bridge-url', url);
  bridgeInput.value = url;
  if (socket) socket.close();

  setWsState('connecting', url);
  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    setWsState('open', url);
    socket.send(JSON.stringify({ type: 'hello', client: 'AEI Quest Control Demo 01', ts: performance.now() }));
    sendFaderNow(true);
  });

  socket.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ack' && typeof msg.clientSentAt === 'number') {
        latestRttMs = performance.now() - msg.clientSentAt;
        setWsState('open', url);
      }
    } catch {
      // Ignore non-JSON diagnostic messages.
    }
  });

  socket.addEventListener('close', () => setWsState('offline', 'connection closed'));
  socket.addEventListener('error', () => setWsState('offline', 'connection error / certificate?'));
}

function sendFaderNow(force = false) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!force && Number.isFinite(lastSentValue) && Math.abs(lastSentValue - faderValue) < 0.001) return;

  const now = performance.now();
  lastSentValue = faderValue;
  lastSendMs = now;
  pendingAckSentAt = now;
  socket.send(JSON.stringify({
    type: 'control',
    address: '/aei/fader/1',
    value: faderValue,
    clientSentAt: now,
  }));
}

function queueFaderSend() {
  const now = performance.now();
  if (now - lastSendMs >= SEND_INTERVAL_MS) sendFaderNow();
}

bridgeInput.value = new URLSearchParams(location.search).get('bridge') || localStorage.getItem('aei-quest-bridge-url') || '';
connectButton.addEventListener('click', connectBridge);

// --- XR input ---------------------------------------------------------------
const controllerState = [
  { connected: false, handedness: '—', hand: false, selecting: false },
  { connected: false, handedness: '—', hand: false, selecting: false },
];
const controllers = [];
const markers = [];
const rays = [];
const previousPinch = [false, false];
const handPinching = [false, false];
const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const rayQuaternion = new THREE.Quaternion();
const tipPos = [new THREE.Vector3(), new THREE.Vector3()];
const thumbPos = [new THREE.Vector3(), new THREE.Vector3()];
const tempLocal = new THREE.Vector3();
const tempBox = new THREE.Box3();
const dragPlane = new THREE.Plane();
const dragPlaneNormal = new THREE.Vector3();
const dragPoint = new THREE.Vector3();
const faderHitMeshes = [knob, track];
let session = null;
let activeInput = null;

function updateDragPlane() {
  panel.getWorldQuaternion(rayQuaternion);
  dragPlaneNormal.set(0, 0, 1).applyQuaternion(rayQuaternion).normalize();
  panel.getWorldPosition(rayOrigin);
  dragPlane.setFromNormalAndCoplanarPoint(dragPlaneNormal, rayOrigin);
}

function worldYToValue(worldPoint) {
  tempLocal.copy(worldPoint);
  panel.worldToLocal(tempLocal);
  return THREE.MathUtils.inverseLerp(TRACK_MIN_Y, TRACK_MAX_Y, tempLocal.y);
}

function isDirectFaderHit(point) {
  for (const mesh of faderHitMeshes) {
    tempBox.setFromObject(mesh).expandByScalar(0.055);
    if (tempBox.containsPoint(point)) return true;
  }
  return false;
}

function controllerFaderHit(controller) {
  controller.getWorldPosition(rayOrigin);
  controller.getWorldQuaternion(rayQuaternion);
  rayDirection.set(0, 0, -1).applyQuaternion(rayQuaternion).normalize();
  raycaster.set(rayOrigin, rayDirection);
  raycaster.far = 3;
  return Boolean(raycaster.intersectObjects(faderHitMeshes, false)[0]);
}

function controllerDragPoint(controller) {
  updateDragPlane();
  controller.getWorldPosition(rayOrigin);
  controller.getWorldQuaternion(rayQuaternion);
  rayDirection.set(0, 0, -1).applyQuaternion(rayQuaternion).normalize();
  raycaster.set(rayOrigin, rayDirection);
  return raycaster.ray.intersectPlane(dragPlane, dragPoint) ? dragPoint : null;
}

function getInputSource(index) {
  if (!session) return null;
  const handedness = controllerState[index].handedness;
  if (handedness && handedness !== 'unknown' && handedness !== '—') {
    const match = Array.from(session.inputSources).find((source) => source.handedness === handedness);
    if (match) return match;
  }
  return Array.from(session.inputSources)[index] || null;
}

function getJointPosition(source, jointName, frame, target) {
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

function makeInput(index) {
  const controller = renderer.xr.getController(index);
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 14, 10),
    new THREE.MeshBasicMaterial({ color: index === 0 ? COLORS.cyan : COLORS.pink, depthTest: false })
  );
  marker.renderOrder = 200;
  marker.visible = false;
  scene.add(marker);

  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.45 })
  );
  ray.scale.z = 1.8;
  controller.add(ray);

  controller.addEventListener('connected', (event) => {
    controllerState[index] = {
      connected: true,
      handedness: event.data?.handedness || 'unknown',
      hand: Boolean(event.data?.hand),
      selecting: false,
    };
    marker.visible = true;
    ray.visible = !controllerState[index].hand;
  });

  controller.addEventListener('disconnected', () => {
    controllerState[index] = { connected: false, handedness: '—', hand: false, selecting: false };
    marker.visible = false;
    ray.visible = false;
    if (activeInput === index) activeInput = null;
  });

  controller.addEventListener('selectstart', () => {
    if (!controllerState[index].hand && controllerFaderHit(controller)) {
      controllerState[index].selecting = true;
      activeInput = index;
      const p = controllerDragPoint(controller);
      if (p) setFaderValue(worldYToValue(p));
    }
  });

  controller.addEventListener('selectend', () => {
    controllerState[index].selecting = false;
    if (activeInput === index) activeInput = null;
    sendFaderNow(true);
  });

  scene.add(controller);
  controllers.push(controller);
  markers.push(marker);
  rays.push(ray);
}
makeInput(0);
makeInput(1);

function updateXRInput(frame) {
  let interacting = false;

  for (let i = 0; i < controllers.length; i += 1) {
    if (!controllerState[i].connected) continue;
    const source = getInputSource(i);

    if (controllerState[i].hand && source?.hand) {
      const gotTip = getJointPosition(source, 'index-finger-tip', frame, tipPos[i]);
      const gotThumb = getJointPosition(source, 'thumb-tip', frame, thumbPos[i]);
      if (!gotTip) continue;

      markers[i].visible = true;
      markers[i].position.copy(tipPos[i]);
      rays[i].visible = false;

      const pinching = Boolean(gotThumb && thumbPos[i].distanceTo(tipPos[i]) < 0.030);
      const directHit = isDirectFaderHit(tipPos[i]);
      if (pinching && !previousPinch[i] && directHit && activeInput == null) activeInput = i;
      if (!pinching && previousPinch[i] && activeInput === i) {
        activeInput = null;
        sendFaderNow(true);
      }
      handPinching[i] = pinching;
      previousPinch[i] = pinching;
      markers[i].scale.setScalar(pinching ? 1.5 : directHit ? 1.2 : 1.0);

      if (activeInput === i && pinching) {
        setFaderValue(worldYToValue(tipPos[i]));
        interacting = true;
      }
    } else {
      rays[i].visible = true;
      controllers[i].getWorldPosition(tipPos[i]);
      markers[i].visible = true;
      markers[i].position.copy(tipPos[i]);
      if (activeInput === i && controllerState[i].selecting) {
        const p = controllerDragPoint(controllers[i]);
        if (p) setFaderValue(worldYToValue(p));
        interacting = true;
      }
    }
  }

  const targetColor = interacting ? COLORS.active : COLORS.knob;
  knob.material.color.lerp(new THREE.Color(targetColor), 0.25);
  knob.material.emissive.lerp(new THREE.Color(targetColor), 0.25);
  knob.material.emissiveIntensity = interacting ? 0.28 : 0.12;
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
    scene.background = isAR ? null : new THREE.Color(0x07090d);
    renderer.setClearAlpha(isAR ? 0 : 1);
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    document.body.classList.add('xr-active');

    session.addEventListener('end', () => {
      session = null;
      activeInput = null;
      document.body.classList.remove('xr-active');
      scene.background = new THREE.Color(0x07090d);
      renderer.setClearAlpha(1);
    }, { once: true });
  } catch (error) {
    supportEl.textContent = `XR start failed: ${error.message}`;
  }
}

vrButton.addEventListener('click', () => startXR('immersive-vr'));
arButton.addEventListener('click', () => startXR('immersive-ar'));

async function detectXR() {
  if (!navigator.xr) {
    supportEl.textContent = 'WebXR unavailable in this browser.';
    return;
  }
  const [vr, ar] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
  ]);
  vrButton.disabled = !vr;
  arButton.disabled = !ar;
  supportEl.textContent = `WebXR: VR ${vr ? 'YES' : 'NO'} • MR/AR ${ar ? 'YES' : 'NO'} • hand tracking optional`;
}
detectXR();

const clock = new THREE.Clock();
renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (frame && session) updateXRInput(frame);
  if (performance.now() - lastSendMs >= SEND_INTERVAL_MS) sendFaderNow();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
