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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const VR_BACKGROUND = new THREE.Color(0xf2f1ec);
const scene = new THREE.Scene();
scene.background = VR_BACKGROUND.clone();

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 3.2);

scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(2.5, 4.5, 3.2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
fillLight.position.set(-3.0, 2.2, -1.4);
scene.add(fillLight);

// ---------------------------------------------------------------------------
// Orbital Node Test 01
// 3D interpretation of the supplied circular-node reference:
// - every node is a layered 3D sphere with a visible origin
// - nodes spin around their own axes
// - child nodes orbit a parent origin through tilted 3D orbit planes
// - connectors always run origin-to-origin
// - hierarchy: central -> primary -> satellite -> optional grandchild
// ---------------------------------------------------------------------------

const COLORS = {
  blue: 0x3d72b8,
  red: 0xef3340,
  yellow: 0xfdbd32,
  cream: 0xf1ddb2,
  white: 0xf8f7f2,
  black: 0x090909,
};

const PALETTE = [
  COLORS.blue,
  COLORS.red,
  COLORS.yellow,
  COLORS.cream,
  COLORS.white,
];

const nodes = [];
const orbitLinks = [];

let seedState = 0xAE120126;
function random01() {
  seedState |= 0;
  seedState = (seedState + 0x6D2B79F5) | 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomRange(min, max) {
  return min + random01() * (max - min);
}

function randomItem(items) {
  return items[Math.floor(random01() * items.length)];
}

function contrastingColor(color) {
  const options = PALETTE.filter((candidate) => candidate !== color);
  return randomItem(options);
}

const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
const smallSphereGeometry = new THREE.SphereGeometry(1, 16, 12);
const axisGeometry = new THREE.CylinderGeometry(1, 1, 2.4, 8);
const connectorGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
const spinRingGeometry = new THREE.TorusGeometry(1, 0.018, 6, 52);
const orbitRingGeometry = new THREE.TorusGeometry(1, 0.006, 4, 72);

const blackMaterial = new THREE.MeshBasicMaterial({ color: COLORS.black });

function makeShellMaterial(color, opacity) {
  return new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.28,
    metalness: 0.0,
    clearcoat: 0.38,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function makeCoreMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.0,
  });
}

function makeLineMaterial(opacity = 0.6) {
  return new THREE.MeshBasicMaterial({
    color: COLORS.black,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function createNode(radius, depth, style = {}) {
  const root = new THREE.Group();
  const visualMount = new THREE.Group();
  const spinGroup = new THREE.Group();

  root.add(visualMount);
  visualMount.add(spinGroup);

  visualMount.rotation.set(
    randomRange(-0.95, 0.95),
    randomRange(-0.95, 0.95),
    randomRange(-Math.PI, Math.PI)
  );

  const outerColor = style.outerColor ?? randomItem(PALETTE);
  const innerColor = style.innerColor ?? contrastingColor(outerColor);
  const shellOpacity = style.shellOpacity ?? randomRange(0.22, 0.42);

  const outer = new THREE.Mesh(
    sphereGeometry,
    makeShellMaterial(outerColor, shellOpacity)
  );
  outer.scale.setScalar(radius);
  spinGroup.add(outer);

  const inner = new THREE.Mesh(
    sphereGeometry,
    makeCoreMaterial(innerColor)
  );
  inner.scale.setScalar(radius * randomRange(0.38, 0.52));
  spinGroup.add(inner);

  const origin = new THREE.Mesh(smallSphereGeometry, blackMaterial);
  origin.scale.setScalar(radius * 0.12);
  spinGroup.add(origin);

  const axis = new THREE.Mesh(axisGeometry, makeLineMaterial(0.72));
  axis.scale.set(radius * 0.018, radius, radius * 0.018);
  visualMount.add(axis);

  const ringA = new THREE.Mesh(spinRingGeometry, makeLineMaterial(0.45));
  ringA.scale.setScalar(radius * 1.015);
  spinGroup.add(ringA);

  const ringB = new THREE.Mesh(spinRingGeometry, makeLineMaterial(0.28));
  ringB.scale.setScalar(radius * 1.015);
  ringB.rotation.x = Math.PI / 2;
  spinGroup.add(ringB);

  const marker = new THREE.Mesh(
    smallSphereGeometry,
    makeCoreMaterial(contrastingColor(outerColor))
  );
  marker.scale.setScalar(radius * 0.075);
  marker.position.set(radius * 0.63, radius * 0.34, radius * 0.58);
  spinGroup.add(marker);

  const depthMultiplier = 1 + depth * 0.22;
  const spinSpeed =
    (random01() < 0.5 ? -1 : 1) *
    randomRange(0.20, 0.52) *
    depthMultiplier;

  const node = {
    root,
    spinGroup,
    radius,
    depth,
    spinSpeed,
    outerColor,
    innerColor,
  };

  nodes.push(node);
  return node;
}

function addOrbit(parent, child, options) {
  const {
    radius,
    speed,
    phase = 0,
    tiltX = 0,
    tiltY = 0,
    tiltZ = 0,
    ringOpacity = 0.20,
  } = options;

  const orbitPlane = new THREE.Group();
  orbitPlane.rotation.set(tiltX, tiltY, tiltZ);

  const rotor = new THREE.Group();
  rotor.rotation.z = phase;

  const ring = new THREE.Mesh(orbitRingGeometry, makeLineMaterial(ringOpacity));
  ring.scale.setScalar(radius);
  orbitPlane.add(ring);

  const connector = new THREE.Mesh(connectorGeometry, makeLineMaterial(0.78));
  connector.position.x = radius * 0.5;
  connector.rotation.z = -Math.PI / 2;
  connector.scale.set(0.006, radius, 0.006);
  rotor.add(connector);

  child.root.position.set(radius, 0, 0);
  rotor.add(child.root);

  orbitPlane.add(rotor);
  parent.root.add(orbitPlane);

  orbitLinks.push({
    orbitPlane,
    rotor,
    parent,
    child,
    orbitSpeed: speed,
  });
}

const systemRoot = new THREE.Group();
systemRoot.position.set(0, 1.43, -1.78);
scene.add(systemRoot);

function buildNetwork() {
  const center = createNode(0.30, 0, {
    outerColor: COLORS.white,
    innerColor: COLORS.blue,
    shellOpacity: 0.16,
  });
  systemRoot.add(center.root);

  const primaryCount = 6;

  for (let i = 0; i < primaryCount; i += 1) {
    const primaryOuter = PALETTE[i % PALETTE.length];
    const primary = createNode(randomRange(0.145, 0.215), 1, {
      outerColor: primaryOuter,
      innerColor: contrastingColor(primaryOuter),
      shellOpacity: randomRange(0.26, 0.44),
    });

    const primaryPhase =
      (i / primaryCount) * Math.PI * 2 + randomRange(-0.20, 0.20);

    addOrbit(center, primary, {
      radius: randomRange(0.62, 0.91),
      speed: (i % 2 === 0 ? 1 : -1) * randomRange(0.085, 0.17),
      phase: primaryPhase,
      tiltX: randomRange(-0.78, 0.78),
      tiltY: randomRange(-0.78, 0.78),
      tiltZ: randomRange(-0.26, 0.26),
      ringOpacity: 0.20,
    });

    const satelliteCount = 2 + Math.floor(random01() * 3);

    for (let j = 0; j < satelliteCount; j += 1) {
      const satellite = createNode(randomRange(0.072, 0.118), 2);

      addOrbit(primary, satellite, {
        radius: randomRange(0.25, 0.43),
        speed:
          (j % 2 === 0 ? 1 : -1) *
          randomRange(0.18, 0.36),
        phase:
          (j / satelliteCount) * Math.PI * 2 +
          randomRange(-0.35, 0.35),
        tiltX: randomRange(-1.05, 1.05),
        tiltY: randomRange(-1.05, 1.05),
        tiltZ: randomRange(-0.45, 0.45),
        ringOpacity: 0.17,
      });

      const grandchildCount =
        random01() < 0.58 ? 1 + (random01() < 0.30 ? 1 : 0) : 0;

      for (let k = 0; k < grandchildCount; k += 1) {
        const grandchild = createNode(randomRange(0.044, 0.072), 3);

        addOrbit(satellite, grandchild, {
          radius: randomRange(0.145, 0.245),
          speed:
            (k % 2 === 0 ? 1 : -1) *
            randomRange(0.31, 0.56),
          phase:
            (k / Math.max(grandchildCount, 1)) * Math.PI * 2 +
            randomRange(-0.8, 0.8),
          tiltX: randomRange(-1.2, 1.2),
          tiltY: randomRange(-1.2, 1.2),
          tiltZ: randomRange(-0.65, 0.65),
          ringOpacity: 0.13,
        });
      }
    }
  }
}

buildNetwork();

// --- Diagnostic HUD ---------------------------------------------------------

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 900;
hudCanvas.height = 410;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;

const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(1.28, 0.58),
  new THREE.MeshBasicMaterial({
    map: hudTexture,
    transparent: true,
    depthTest: false,
  })
);
hud.position.set(-1.23, 2.18, -2.55);
hud.renderOrder = 100;
scene.add(hud);

let currentMode = 'screen';
let session = null;
let lastFrameTime = 0;
let lastHudUpdate = 0;
let fpsSmoothed = 72;

function drawHud(time) {
  if (time - lastHudUpdate < 120) return;
  lastHudUpdate = time;

  let handCount = 0;
  let controllerCount = 0;

  if (session) {
    for (const source of session.inputSources) {
      if (source.hand) handCount += 1;
      else controllerCount += 1;
    }
  }

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = 'rgba(248,247,242,.92)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.strokeStyle = 'rgba(9,9,9,.80)';
  hudCtx.lineWidth = 4;
  hudCtx.strokeRect(2, 2, hudCanvas.width - 4, hudCanvas.height - 4);

  hudCtx.fillStyle = '#090909';
  hudCtx.font = '700 38px system-ui, sans-serif';
  hudCtx.fillText('AEI QUEST — ORBITAL NODE TEST 01', 38, 58);

  hudCtx.font = '24px ui-monospace, monospace';
  const lines = [
    `mode: ${currentMode}   XR: ${renderer.xr.isPresenting ? 'ACTIVE' : 'screen'}`,
    `nodes: ${nodes.length}   origin links: ${orbitLinks.length}`,
    `self spin: ON   3D orbital hierarchy: ON`,
    `controllers: ${controllerCount}   hands: ${handCount}`,
    `fps: ${fpsSmoothed.toFixed(1)}`,
  ];

  lines.forEach((line, index) => {
    hudCtx.fillText(line, 38, 112 + index * 50);
  });

  hudTexture.needsUpdate = true;
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

    await renderer.xr.setSession(session);

    session.addEventListener(
      'end',
      () => {
        session = null;
        currentMode = 'screen';
        document.body.classList.remove('xr-active');
        scene.background = VR_BACKGROUND.clone();
      },
      { once: true }
    );
  } catch (error) {
    console.error(error);
    supportEl.textContent = `Could not start ${mode}: ${error.message}`;
  }
}

vrButton.addEventListener('click', () => startXR('immersive-vr'));
arButton.addEventListener('click', () => startXR('immersive-ar'));

async function detectSupport() {
  if (!navigator.xr) {
    supportEl.textContent =
      'WebXR API not available in this browser/context. Use HTTPS in Quest Browser.';
    return;
  }

  const [vrSupported, arSupported] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
  ]);

  vrButton.disabled = !vrSupported;
  arButton.disabled = !arSupported;

  supportEl.textContent =
    `WebXR: VR ${vrSupported ? 'YES' : 'NO'} / ` +
    `MR-AR ${arSupported ? 'YES' : 'NO'}`;
}

renderer.setAnimationLoop((time) => {
  const dt =
    lastFrameTime > 0
      ? THREE.MathUtils.clamp((time - lastFrameTime) / 1000, 0.001, 0.04)
      : 1 / 72;
  lastFrameTime = time;

  const instantaneousFps = 1 / Math.max(dt, 0.001);
  fpsSmoothed = THREE.MathUtils.lerp(
    fpsSmoothed,
    instantaneousFps,
    THREE.MathUtils.clamp(dt * 3.2, 0, 1)
  );

  for (const node of nodes) {
    node.spinGroup.rotation.y += node.spinSpeed * dt;
  }

  for (const link of orbitLinks) {
    link.rotor.rotation.z += link.orbitSpeed * dt;
  }

  const seconds = time * 0.001;
  systemRoot.rotation.y += dt * 0.020;
  systemRoot.rotation.x = Math.sin(seconds * 0.11) * 0.045;
  systemRoot.rotation.z = Math.sin(seconds * 0.075) * 0.025;

  drawHud(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

detectSupport();
