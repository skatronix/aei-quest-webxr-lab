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

scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2, 4, 2);
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4, 64),
  new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.32, 0.32, 0.32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.18 })
);
cube.position.set(0, 1.55, -1.2);
scene.add(cube);

// World-space diagnostic panel, visible inside XR.
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024;
hudCanvas.height = 512;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;
const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(1.35, 0.675),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hud.position.set(0, 1.55, -1.85);
scene.add(hud);

const controllerState = [
  { connected: false, handedness: '—', hand: false },
  { connected: false, handedness: '—', hand: false },
];
let selectCount = 0;
let currentMode = 'screen';
let session = null;
let lastHudUpdate = 0;
const headPos = new THREE.Vector3();

function makeController(index) {
  const controller = renderer.xr.getController(index);
  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  ray.scale.z = 2.0;
  controller.add(ray);

  controller.addEventListener('connected', (event) => {
    controllerState[index] = {
      connected: true,
      handedness: event.data?.handedness || 'unknown',
      hand: Boolean(event.data?.hand),
    };
  });

  controller.addEventListener('disconnected', () => {
    controllerState[index] = { connected: false, handedness: '—', hand: false };
  });

  controller.addEventListener('selectstart', () => {
    selectCount += 1;
    cube.scale.setScalar(1.4);
  });

  controller.addEventListener('selectend', () => {
    cube.scale.setScalar(1.0);
  });

  scene.add(controller);
}

makeController(0);
makeController(1);

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

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = 'rgba(5,5,5,.88)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.strokeStyle = 'rgba(255,255,255,.35)';
  hudCtx.lineWidth = 3;
  hudCtx.strokeRect(2, 2, hudCanvas.width - 4, hudCanvas.height - 4);

  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = '700 42px system-ui, sans-serif';
  hudCtx.fillText('AEI QUEST WEBXR DEMO 01', 46, 70);

  hudCtx.font = '28px ui-monospace, monospace';
  const lines = [
    `mode: ${currentMode}`,
    `XR session: ${renderer.xr.isPresenting ? 'ACTIVE' : 'screen preview'}`,
    `head xyz: ${headPos.x.toFixed(2)}  ${headPos.y.toFixed(2)}  ${headPos.z.toFixed(2)}`,
    `controllers: ${controllerCount}   hands: ${handCount}`,
    `select / trigger events: ${selectCount}`,
    `input 0: ${controllerState[0].handedness} ${controllerState[0].hand ? '(hand)' : ''}`,
    `input 1: ${controllerState[1].handedness} ${controllerState[1].hand ? '(hand)' : ''}`,
  ];

  lines.forEach((line, i) => hudCtx.fillText(line, 46, 132 + i * 48));
  hudTexture.needsUpdate = true;
}

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

    session.addEventListener('end', () => {
      session = null;
      currentMode = 'screen';
      document.body.classList.remove('xr-active');
      scene.background = new THREE.Color(0x070707);
      floor.visible = true;
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

renderer.setAnimationLoop((time) => {
  cube.rotation.x = time * 0.00035;
  cube.rotation.y = time * 0.00055;
  cube.position.y = 1.55 + Math.sin(time * 0.0012) * 0.06;
  drawHud(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

detectSupport();
