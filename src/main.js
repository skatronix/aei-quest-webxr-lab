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
cube.position.set(0, 1.45, -0.8);
scene.add(cube);

// Continuous spatial-control visual: input distance drives this ring.
const distanceRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.22, 0.025, 16, 96),
  new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.4, metalness: 0.2 })
);
distanceRing.position.set(0, 1.05, -1.0);
scene.add(distanceRing);

// World-space diagnostic panel, visible inside XR.
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024;
hudCanvas.height = 640;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;
const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(1.45, 0.9),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hud.position.set(0, 1.7, -1.9);
scene.add(hud);

const controllerState = [
  { connected: false, handedness: '—', hand: false },
  { connected: false, handedness: '—', hand: false },
];

const inputs = [];
const inputPos = [new THREE.Vector3(), new THREE.Vector3()];
const cubeWorldPos = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const tempDirection = new THREE.Vector3();

let selectCount = 0;
let currentMode = 'screen';
let session = null;
let lastHudUpdate = 0;
let grabbedBy = -1;
let inputDistance = 0;
const headPos = new THREE.Vector3();

function makeController(index) {
  const controller = renderer.xr.getController(index);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 24, 16),
    new THREE.MeshBasicMaterial({ color: index === 0 ? 0x8fd3ff : 0xff9dc7 })
  );
  controller.add(marker);

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

    controller.updateMatrixWorld(true);
    cube.updateMatrixWorld(true);
    controller.getWorldPosition(inputPos[index]);

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    tempDirection.set(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    raycaster.set(inputPos[index], tempDirection);

    const hit = raycaster.intersectObject(cube, false)[0];
    if (hit && hit.distance < 2.5 && grabbedBy === -1) {
      controller.attach(cube);
      grabbedBy = index;
    } else if (grabbedBy === -1) {
      cube.scale.multiplyScalar(1.15);
    }
  });

  controller.addEventListener('selectend', () => {
    if (grabbedBy === index) {
      scene.attach(cube);
      grabbedBy = -1;
    } else if (grabbedBy === -1) {
      cube.scale.setScalar(1.0);
    }
  });

  scene.add(controller);
  inputs.push(controller);
}

makeController(0);
makeController(1);

function updateSpatialInputs() {
  let connectedCount = 0;

  for (let i = 0; i < inputs.length; i += 1) {
    if (!controllerState[i].connected) continue;
    inputs[i].getWorldPosition(inputPos[i]);
    connectedCount += 1;
  }

  if (connectedCount === 2) {
    inputDistance = inputPos[0].distanceTo(inputPos[1]);
    const mapped = THREE.MathUtils.clamp(inputDistance, 0.15, 1.2);
    const scale = THREE.MathUtils.mapLinear(mapped, 0.15, 1.2, 0.45, 1.8);
    distanceRing.scale.setScalar(scale);
    distanceRing.rotation.z += 0.012;
  }

  if (grabbedBy === -1) {
    cube.rotation.x += 0.004;
    cube.rotation.y += 0.006;
  }

  cube.getWorldPosition(cubeWorldPos);
}

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
  hudCtx.font = '700 40px system-ui, sans-serif';
  hudCtx.fillText('AEI QUEST WEBXR DEMO 01.1', 42, 64);

  hudCtx.font = '25px ui-monospace, monospace';
  const fmt = (v) => `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}`;
  const lines = [
    `mode: ${currentMode}`,
    `XR session: ${renderer.xr.isPresenting ? 'ACTIVE' : 'screen preview'}`,
    `head xyz: ${fmt(headPos)}`,
    `controllers: ${controllerCount}   hands: ${handCount}`,
    `input 0 ${controllerState[0].handedness}: ${fmt(inputPos[0])}`,
    `input 1 ${controllerState[1].handedness}: ${fmt(inputPos[1])}`,
    `input distance: ${inputDistance.toFixed(3)} m`,
    `cube xyz: ${fmt(cubeWorldPos)}   grabbed: ${grabbedBy >= 0 ? grabbedBy : 'no'}`,
    `select / pinch events: ${selectCount}`,
  ];

  lines.forEach((line, i) => hudCtx.fillText(line, 42, 118 + i * 48));
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
      if (grabbedBy >= 0) {
        scene.attach(cube);
        grabbedBy = -1;
      }
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
  updateSpatialInputs();
  cube.position.y += Math.sin(time * 0.0012) * 0.00015;
  drawHud(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

detectSupport();
