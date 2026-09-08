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
// Orbital Node Test 01.1 — input reliability fix
//
// Important change from 01:
// input is read directly from session.inputSources every XR frame instead of
// relying on Three.js controller "connected" events. Hands use index-finger-tip
// joint poses and controllers use targetRaySpace poses directly.
//
// Bubble Test behaviour restored on top of the orbital hierarchy:
// slow contact pushes + squashes a node branch, direct fast impact pops the
// node visual temporarily, and tangential swipes are less likely to pop it.
// ---------------------------------------------------------------------------

const COLORS = {
  blue: 0x3d72b8,
  red: 0xef3340,
  yellow: 0xfdbd32,
  cream: 0xf1ddb2,
  white: 0xf8f7f2,
  black: 0x090909,
};

const PALETTE = [COLORS.blue, COLORS.red, COLORS.yellow, COLORS.cream, COLORS.white];

const INPUT_RADIUS = 0.075;
const POP_IMPACT_SPEED = 0.95;
const POP_DURATION = 0.18;
const RESPAWN_DELAY = 0.42;
const NODE_SPRING = 10.5;
const NODE_DAMPING = 6.5;
const ANGULAR_DAMPING = 4.8;
const DEFORM_DECAY = 6.0;
const MAX_INTERACTION_OFFSET = 0.28;

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
  return randomItem(PALETTE.filter((candidate) => candidate !== color));
}

const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
const smallSphereGeometry = new THREE.SphereGeometry(1, 16, 12);
const axisGeometry = new THREE.CylinderGeometry(1, 1, 2.4, 8);
const spinRingGeometry = new THREE.TorusGeometry(1, 0.018, 6, 52);
const orbitRingGeometry = new THREE.TorusGeometry(1, 0.006, 4, 72);

const blackMaterial = new THREE.MeshBasicMaterial({ color: COLORS.black });

function makeShellMaterial(color, opacity) {
  return new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.28,
    metalness: 0,
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
    metalness: 0,
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
  const interactionGroup = new THREE.Group();
  const visualMount = new THREE.Group();
  const spinGroup = new THREE.Group();

  root.add(interactionGroup);
  interactionGroup.add(visualMount);
  visualMount.add(spinGroup);

  visualMount.rotation.set(
    randomRange(-0.95, 0.95),
    randomRange(-0.95, 0.95),
    randomRange(-Math.PI, Math.PI)
  );

  const outerColor = style.outerColor ?? randomItem(PALETTE);
  const innerColor = style.innerColor ?? contrastingColor(outerColor);
  const shellOpacity = style.shellOpacity ?? randomRange(0.22, 0.42);

  const outer = new THREE.Mesh(sphereGeometry, makeShellMaterial(outerColor, shellOpacity));
  outer.scale.setScalar(radius);
  spinGroup.add(outer);

  const inner = new THREE.Mesh(sphereGeometry, makeCoreMaterial(innerColor));
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
    (random01() < 0.5 ? -1 : 1) * randomRange(0.20, 0.52) * depthMultiplier;

  const node = {
    root,
    interactionGroup,
    visualMount,
    spinGroup,
    radius,
    depth,
    spinSpeed,
    interactionVelocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    worldPosition: new THREE.Vector3(),
    deform: 0,
    deformNormalLocal: new THREE.Vector3(0, 0, 1),
    popping: false,
    popAge: 0,
    respawnTimer: 0,
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

  child.root.position.set(radius, 0, 0);
  rotor.add(child.root);
  orbitPlane.add(rotor);
  parent.interactionGroup.add(orbitPlane);

  const connectorGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const connector = new THREE.Line(
    connectorGeometry,
    new THREE.LineBasicMaterial({
      color: COLORS.black,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    })
  );
  scene.add(connector);

  orbitLinks.push({ orbitPlane, rotor, parent, child, connector, orbitSpeed: speed });
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

    addOrbit(center, primary, {
      radius: randomRange(0.62, 0.91),
      speed: (i % 2 === 0 ? 1 : -1) * randomRange(0.085, 0.17),
      phase: (i / primaryCount) * Math.PI * 2 + randomRange(-0.20, 0.20),
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
        speed: (j % 2 === 0 ? 1 : -1) * randomRange(0.18, 0.36),
        phase: (j / satelliteCount) * Math.PI * 2 + randomRange(-0.35, 0.35),
        tiltX: randomRange(-1.05, 1.05),
        tiltY: randomRange(-1.05, 1.05),
        tiltZ: randomRange(-0.45, 0.45),
        ringOpacity: 0.17,
      });

      const grandchildCount = random01() < 0.58 ? 1 + (random01() < 0.30 ? 1 : 0) : 0;
      for (let k = 0; k < grandchildCount; k += 1) {
        const grandchild = createNode(randomRange(0.044, 0.072), 3);
        addOrbit(satellite, grandchild, {
          radius: randomRange(0.145, 0.245),
          speed: (k % 2 === 0 ? 1 : -1) * randomRange(0.31, 0.56),
          phase: randomRange(-0.8, 0.8),
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

// --- XR spatial input: direct session.inputSources --------------------------

const inputStates = [
  {
    active: false,
    handedness: 'left',
    kind: 'none',
    pos: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    speed: 0,
    hasPrevious: false,
  },
  {
    active: false,
    handedness: 'right',
    kind: 'none',
    pos: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    speed: 0,
    hasPrevious: false,
  },
];

const inputMarkers = inputStates.map((state, index) => {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.034, 16, 12),
    new THREE.MeshBasicMaterial({
      color: index === 0 ? 0x8fd3ff : 0xff9dc7,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
    })
  );
  marker.visible = false;
  marker.renderOrder = 200;
  scene.add(marker);
  return marker;
});

const rawVelocity = new THREE.Vector3();
const contactNormalWorld = new THREE.Vector3();
const localNormal = new THREE.Vector3();
const localVelocity = new THREE.Vector3();
const rootWorldQuaternion = new THREE.Quaternion();
const inverseRootQuaternion = new THREE.Quaternion();
const torque = new THREE.Vector3();
const springVector = new THREE.Vector3();
const linkStart = new THREE.Vector3();
const linkEnd = new THREE.Vector3();

let contactCount = 0;
let poppedCount = 0;
let frameImpactSpeed = 0;
let displayedImpactSpeed = 0;

let currentMode = 'screen';
let session = null;

function sourceForHandedness(handedness) {
  if (!session) return null;
  const sources = Array.from(session.inputSources);
  return (
    sources.find((source) => source.handedness === handedness) ||
    sources.find((source) => source.handedness === 'none') ||
    null
  );
}

function updateSingleInput(state, marker, source, frame, refSpace, dt) {
  if (!source || !frame || !refSpace) {
    state.active = false;
    state.kind = 'none';
    state.speed = 0;
    state.velocity.set(0, 0, 0);
    state.hasPrevious = false;
    marker.visible = false;
    return;
  }

  let pose = null;
  if (source.hand) {
    const tip = source.hand.get('index-finger-tip');
    if (tip) pose = frame.getJointPose(tip, refSpace);
    state.kind = 'hand';
  } else {
    pose = frame.getPose(source.targetRaySpace, refSpace);
    state.kind = 'controller';
  }

  if (!pose) {
    state.active = false;
    marker.visible = false;
    return;
  }

  state.active = true;
  state.pos.set(
    pose.transform.position.x,
    pose.transform.position.y,
    pose.transform.position.z
  );

  marker.visible = true;
  marker.position.copy(state.pos);

  if (state.hasPrevious && dt > 0.0001) {
    rawVelocity.copy(state.pos).sub(state.prev).multiplyScalar(1 / dt);
    const blend = THREE.MathUtils.clamp(dt * 12.0, 0, 1);
    state.velocity.lerp(rawVelocity, blend);
    state.speed = state.velocity.length();
  } else {
    state.velocity.set(0, 0, 0);
    state.speed = 0;
    state.hasPrevious = true;
  }

  state.prev.copy(state.pos);
}

function updateInputKinematics(dt, frame) {
  if (!session || !frame) {
    inputStates.forEach((state, i) => {
      state.active = false;
      state.kind = 'none';
      state.hasPrevious = false;
      inputMarkers[i].visible = false;
    });
    return;
  }

  const refSpace = renderer.xr.getReferenceSpace();
  if (!refSpace) return;

  updateSingleInput(
    inputStates[0],
    inputMarkers[0],
    sourceForHandedness('left'),
    frame,
    refSpace,
    dt
  );

  updateSingleInput(
    inputStates[1],
    inputMarkers[1],
    sourceForHandedness('right'),
    frame,
    refSpace,
    dt
  );
}

function popNode(node) {
  if (node.popping || node.respawnTimer > 0) return;
  node.popping = true;
  node.popAge = 0;
  node.interactionVelocity.multiplyScalar(0.2);
  node.angularVelocity.multiplyScalar(1.7);
  poppedCount += 1;
}

function interactWithNodes(dt) {
  frameImpactSpeed = 0;

  for (const node of nodes) {
    if (node.popping || node.respawnTimer > 0) continue;

    node.interactionGroup.getWorldPosition(node.worldPosition);

    for (const input of inputStates) {
      if (!input.active) continue;

      const distance = node.worldPosition.distanceTo(input.pos);
      const contactDistance = node.radius + INPUT_RADIUS;
      if (distance >= contactDistance) continue;

      contactCount += 1;

      contactNormalWorld.copy(node.worldPosition).sub(input.pos);
      if (contactNormalWorld.lengthSq() < 0.000001) contactNormalWorld.set(0, 0, 1);
      else contactNormalWorld.normalize();

      const impactSpeed = Math.max(0, input.velocity.dot(contactNormalWorld));
      frameImpactSpeed = Math.max(frameImpactSpeed, impactSpeed);

      node.root.getWorldQuaternion(rootWorldQuaternion);
      inverseRootQuaternion.copy(rootWorldQuaternion).invert();
      localNormal.copy(contactNormalWorld).applyQuaternion(inverseRootQuaternion);
      localVelocity.copy(input.velocity).applyQuaternion(inverseRootQuaternion);

      const penetration = contactDistance - distance;
      const penetrationRatio = THREE.MathUtils.clamp(
        penetration / Math.max(contactDistance, 0.001),
        0,
        1
      );

      const deformation = THREE.MathUtils.clamp(
        impactSpeed * 0.28 + penetrationRatio * 0.40,
        0,
        0.44
      );
      if (deformation > node.deform) {
        node.deform = deformation;
        node.deformNormalLocal.copy(localNormal);
      }

      if (impactSpeed >= POP_IMPACT_SPEED) {
        popNode(node);
        break;
      }

      // Same spirit as Bubble Test: transfer input velocity + separate surfaces.
      node.interactionVelocity.addScaledVector(localVelocity, 0.22);
      node.interactionVelocity.addScaledVector(
        localNormal,
        0.06 + penetrationRatio * 0.12
      );
      node.interactionVelocity.clampLength(0, 0.80);

      node.interactionGroup.position.addScaledVector(localNormal, penetration * 0.62);

      torque.copy(localNormal).cross(localVelocity).multiplyScalar(0.10);
      node.angularVelocity.add(torque);
      node.angularVelocity.clampLength(0, 1.8);
    }
  }

  displayedImpactSpeed = THREE.MathUtils.lerp(
    displayedImpactSpeed,
    frameImpactSpeed,
    THREE.MathUtils.clamp(dt * 10.0, 0, 1)
  );
}

function updateNodeInteraction(node, dt) {
  if (node.popping) {
    node.popAge += dt;
    const t = THREE.MathUtils.clamp(node.popAge / POP_DURATION, 0, 1);
    const pulse = 1 + Math.sin(t * Math.PI) * 0.80;
    node.visualMount.scale.setScalar(pulse);

    if (t >= 1) {
      node.popping = false;
      node.visualMount.visible = false;
      node.respawnTimer = RESPAWN_DELAY;
      node.visualMount.scale.setScalar(1);
    }
    return;
  }

  if (node.respawnTimer > 0) {
    node.respawnTimer -= dt;
    if (node.respawnTimer <= 0) {
      node.respawnTimer = 0;
      node.visualMount.visible = true;
      node.deform = 0;
      node.visualMount.scale.setScalar(1);
    }
  }

  springVector.copy(node.interactionGroup.position).multiplyScalar(-NODE_SPRING * dt);
  node.interactionVelocity.add(springVector);
  node.interactionVelocity.multiplyScalar(Math.exp(-NODE_DAMPING * dt));
  node.interactionGroup.position.addScaledVector(node.interactionVelocity, dt);

  if (node.interactionGroup.position.length() > MAX_INTERACTION_OFFSET) {
    node.interactionGroup.position.setLength(MAX_INTERACTION_OFFSET);
  }

  node.interactionGroup.rotation.x += node.angularVelocity.x * dt;
  node.interactionGroup.rotation.y += node.angularVelocity.y * dt;
  node.interactionGroup.rotation.z += node.angularVelocity.z * dt;
  node.angularVelocity.multiplyScalar(Math.exp(-ANGULAR_DAMPING * dt));

  const rotationReturn = Math.exp(-3.6 * dt);
  node.interactionGroup.rotation.x *= rotationReturn;
  node.interactionGroup.rotation.y *= rotationReturn;
  node.interactionGroup.rotation.z *= rotationReturn;

  if (node.visualMount.visible) {
    const d = node.deform;
    if (d > 0.001) {
      // Bubble-like squash: intentionally simple and Quest-friendly.
      node.visualMount.scale.set(1 + d * 0.24, 1 + d * 0.24, 1 - d * 0.50);
      node.deform *= Math.exp(-DEFORM_DECAY * dt);
    } else {
      node.visualMount.scale.lerp(new THREE.Vector3(1, 1, 1), THREE.MathUtils.clamp(dt * 12, 0, 1));
      node.deform = 0;
    }
  }
}

function updateDynamicConnectors() {
  for (const link of orbitLinks) {
    link.parent.interactionGroup.getWorldPosition(linkStart);
    link.child.interactionGroup.getWorldPosition(linkEnd);

    const position = link.connector.geometry.attributes.position;
    position.setXYZ(0, linkStart.x, linkStart.y, linkStart.z);
    position.setXYZ(1, linkEnd.x, linkEnd.y, linkEnd.z);
    position.needsUpdate = true;
  }
}

// --- Diagnostic HUD ---------------------------------------------------------

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 980;
hudCanvas.height = 560;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);
hudTexture.colorSpace = THREE.SRGBColorSpace;

const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(1.36, 0.78),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, depthTest: false })
);
hud.position.set(-1.20, 2.10, -2.55);
hud.renderOrder = 100;
scene.add(hud);

let lastFrameTime = 0;
let lastHudUpdate = 0;
let fpsSmoothed = 72;

function drawHud(time) {
  if (time - lastHudUpdate < 120) return;
  lastHudUpdate = time;

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = 'rgba(248,247,242,.92)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.strokeStyle = 'rgba(9,9,9,.80)';
  hudCtx.lineWidth = 4;
  hudCtx.strokeRect(2, 2, hudCanvas.width - 4, hudCanvas.height - 4);

  hudCtx.fillStyle = '#090909';
  hudCtx.font = '700 36px system-ui, sans-serif';
  hudCtx.fillText('AEI QUEST — ORBITAL NODE TEST 01.1', 36, 56);

  hudCtx.font = '23px ui-monospace, monospace';
  const lines = [
    `mode: ${currentMode}   XR: ${renderer.xr.isPresenting ? 'ACTIVE' : 'screen'}`,
    `nodes: ${nodes.length}   links: ${orbitLinks.length}`,
    `left: ${inputStates[0].active ? inputStates[0].kind : '—'}  ${inputStates[0].speed.toFixed(2)} m/s`,
    `right: ${inputStates[1].active ? inputStates[1].kind : '—'}  ${inputStates[1].speed.toFixed(2)} m/s`,
    `contacts: ${contactCount}   impact: ${displayedImpactSpeed.toFixed(2)} m/s`,
    `popped: ${poppedCount}   threshold: ${POP_IMPACT_SPEED.toFixed(2)} m/s`,
    `touch: PUSH + SQUASH + ELASTIC RETURN`,
    `fps: ${fpsSmoothed.toFixed(1)}`,
  ];

  lines.forEach((line, index) => {
    hudCtx.fillText(line, 36, 108 + index * 49);
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
    inputStates.forEach((state) => {
      state.active = false;
      state.hasPrevious = false;
      state.velocity.set(0, 0, 0);
      state.speed = 0;
    });

    session.addEventListener(
      'end',
      () => {
        session = null;
        currentMode = 'screen';
        document.body.classList.remove('xr-active');
        scene.background = VR_BACKGROUND.clone();
        inputStates.forEach((state, i) => {
          state.active = false;
          state.hasPrevious = false;
          state.velocity.set(0, 0, 0);
          state.speed = 0;
          inputMarkers[i].visible = false;
        });
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
    supportEl.textContent = 'WebXR API not available in this browser/context. Use HTTPS in Quest Browser.';
    return;
  }

  const [vrSupported, arSupported] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
  ]);

  vrButton.disabled = !vrSupported;
  arButton.disabled = !arSupported;
  supportEl.textContent =
    `WebXR: VR ${vrSupported ? 'YES' : 'NO'} / MR-AR ${arSupported ? 'YES' : 'NO'}`;
}

renderer.setAnimationLoop((time, frame) => {
  const dt =
    lastFrameTime > 0
      ? THREE.MathUtils.clamp((time - lastFrameTime) / 1000, 0.001, 0.04)
      : 1 / 72;
  lastFrameTime = time;

  fpsSmoothed = THREE.MathUtils.lerp(
    fpsSmoothed,
    1 / Math.max(dt, 0.001),
    THREE.MathUtils.clamp(dt * 3.2, 0, 1)
  );

  updateInputKinematics(dt, frame);
  interactWithNodes(dt);

  for (const node of nodes) {
    node.spinGroup.rotation.y += node.spinSpeed * dt;
    updateNodeInteraction(node, dt);
  }

  for (const link of orbitLinks) link.rotor.rotation.z += link.orbitSpeed * dt;

  const seconds = time * 0.001;
  systemRoot.rotation.y += dt * 0.020;
  systemRoot.rotation.x = Math.sin(seconds * 0.11) * 0.045;
  systemRoot.rotation.z = Math.sin(seconds * 0.075) * 0.025;

  updateDynamicConnectors();
  drawHud(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

detectSupport();