import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#xr-canvas');
const supportEl = document.querySelector('#support');
const arButton = document.querySelector('#enter-ar');
const vrButton = document.querySelector('#enter-vr');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030507);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  50
);
camera.position.set(0, 1.6, 2);

// -----------------------------------------------------------------------------
// Spatial surface data
// -----------------------------------------------------------------------------

const points = [];
const pointMarkers = [];

const surfaceMaterial = new THREE.MeshBasicMaterial({
  color: 0x39e7ff,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const surfaceGeometry = new THREE.BufferGeometry();
const surfaceMesh = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
surfaceMesh.visible = false;
scene.add(surfaceMesh);

const outlineGeometry = new THREE.BufferGeometry();
const outline = new THREE.LineLoop(
  outlineGeometry,
  new THREE.LineBasicMaterial({
    color: 0x8ff7ff,
    transparent: true,
    opacity: 0.95,
  })
);
outline.visible = false;
scene.add(outline);

function makeMarker(position, index) {
  const colors = [0x00ffff, 0x70ff9b, 0xffe75c, 0xff70d7];

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 16, 12),
    new THREE.MeshBasicMaterial({ color: colors[index] })
  );

  marker.position.copy(position);
  scene.add(marker);
  pointMarkers.push(marker);
}

function rebuildSurface() {
  outline.visible = points.length >= 2;

  if (points.length >= 2) {
    const outlinePoints = points.map((p) => p.clone());
    outlineGeometry.setFromPoints(outlinePoints);
  }

  if (points.length !== 4) {
    surfaceMesh.visible = false;
    return;
  }

  const vertices = new Float32Array([
    points[0].x, points[0].y, points[0].z,
    points[1].x, points[1].y, points[1].z,
    points[2].x, points[2].y, points[2].z,

    points[0].x, points[0].y, points[0].z,
    points[2].x, points[2].y, points[2].z,
    points[3].x, points[3].y, points[3].z,
  ]);

  surfaceGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(vertices, 3)
  );
  surfaceGeometry.computeVertexNormals();

  surfaceMesh.visible = true;

  console.log('AEI Spatial Mapper surface:', {
    p1: points[0].toArray(),
    p2: points[1].toArray(),
    p3: points[2].toArray(),
    p4: points[3].toArray(),
  });
}

function resetSurface() {
  points.length = 0;

  for (const marker of pointMarkers) {
    scene.remove(marker);
    marker.geometry.dispose();
    marker.material.dispose();
  }

  pointMarkers.length = 0;
  surfaceMesh.visible = false;
  outline.visible = false;

  console.log('AEI Spatial Mapper: reset');
}

// -----------------------------------------------------------------------------
// XR input
// -----------------------------------------------------------------------------

const controllerState = [
  { connected: false, handedness: 'unknown', hand: false },
  { connected: false, handedness: 'unknown', hand: false },
];

const controllers = [];
const handTips = [new THREE.Vector3(), new THREE.Vector3()];
const handTipValid = [false, false];

const tempPos = new THREE.Vector3();
const tempDir = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();

function placePoint(index) {
  // Fifth point starts a fresh surface automatically.
  if (points.length >= 4) {
    resetSurface();
  }

  const p = new THREE.Vector3();

  if (controllerState[index].hand && handTipValid[index]) {
    // Hand tracking: place exactly at index fingertip.
    p.copy(handTips[index]);
  } else {
    // Touch controller: place 75 cm along controller aim ray.
    const controller = controllers[index];
    controller.updateMatrixWorld(true);
    controller.getWorldPosition(tempPos);

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    tempDir
      .set(0, 0, -1)
      .applyMatrix4(tempMatrix)
      .normalize();

    p.copy(tempPos).addScaledVector(tempDir, 0.75);
  }

  points.push(p.clone());
  makeMarker(p, points.length - 1);
  rebuildSurface();

  console.log(
    `AEI Spatial Mapper point ${points.length}:`,
    p.x.toFixed(4),
    p.y.toFixed(4),
    p.z.toFixed(4)
  );
}

function makeController(index) {
  const controller = renderer.xr.getController(index);

  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]),
    new THREE.LineBasicMaterial({
      color: index === 0 ? 0x75eaff : 0xff75d8,
      transparent: true,
      opacity: 0.65,
    })
  );
  ray.scale.z = 0.75;
  controller.add(ray);

  controller.addEventListener('connected', (event) => {
    controllerState[index] = {
      connected: true,
      handedness: event.data?.handedness || 'unknown',
      hand: Boolean(event.data?.hand),
    };

    ray.visible = !controllerState[index].hand;
  });

  controller.addEventListener('disconnected', () => {
    controllerState[index] = {
      connected: false,
      handedness: 'unknown',
      hand: false,
    };
    handTipValid[index] = false;
  });

  // Touch trigger OR hand pinch.
  controller.addEventListener('selectstart', () => {
    placePoint(index);
  });

  // Touch grip / squeeze resets the surface.
  controller.addEventListener('squeezestart', () => {
    resetSurface();
  });

  scene.add(controller);
  controllers.push(controller);
}

makeController(0);
makeController(1);

// Fingertip cursors
const cursors = [0, 1].map((i) => {
  const cursor = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 12, 8),
    new THREE.MeshBasicMaterial({
      color: i === 0 ? 0x75eaff : 0xff75d8,
    })
  );

  cursor.visible = false;
  scene.add(cursor);
  return cursor;
});

let session = null;

function updateHandTips(frame) {
  handTipValid[0] = false;
  handTipValid[1] = false;
  cursors[0].visible = false;
  cursors[1].visible = false;

  if (!session || !frame) return;

  const refSpace = renderer.xr.getReferenceSpace();
  if (!refSpace) return;

  for (let i = 0; i < 2; i++) {
    const state = controllerState[i];

    if (!state.connected || !state.hand) continue;

    const source = Array.from(session.inputSources).find(
      (s) => s.hand && s.handedness === state.handedness
    );

    const joint = source?.hand?.get('index-finger-tip');
    if (!joint) continue;

    const pose = frame.getJointPose(joint, refSpace);
    if (!pose) continue;

    handTips[i].set(
      pose.transform.position.x,
      pose.transform.position.y,
      pose.transform.position.z
    );

    handTipValid[i] = true;
    cursors[i].position.copy(handTips[i]);
    cursors[i].visible = true;
  }
}

// -----------------------------------------------------------------------------
// XR
// -----------------------------------------------------------------------------

async function startXR(mode) {
  if (!navigator.xr || session) return;

  try {
    session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: [
        'hand-tracking',
        'bounded-floor',
      ],
    });

    document.body.classList.add('xr-active');

    scene.background =
      mode === 'immersive-ar'
        ? null
        : new THREE.Color(0x030507);

    await renderer.xr.setSession(session);

    session.addEventListener(
      'end',
      () => {
        session = null;
        document.body.classList.remove('xr-active');
        scene.background = new THREE.Color(0x030507);
      },
      { once: true }
    );
  } catch (err) {
    console.error(err);
    supportEl.textContent = `Could not start ${mode}: ${err.message}`;
  }
}

arButton.addEventListener('click', () => startXR('immersive-ar'));
vrButton.addEventListener('click', () => startXR('immersive-vr'));

async function detectSupport() {
  if (!navigator.xr) {
    supportEl.textContent =
      'WebXR unavailable. Quest Browser + HTTPS required.';
    return;
  }

  const [ar, vr] = await Promise.all([
    navigator.xr
      .isSessionSupported('immersive-ar')
      .catch(() => false),

    navigator.xr
      .isSessionSupported('immersive-vr')
      .catch(() => false),
  ]);

  arButton.disabled = !ar;
  vrButton.disabled = !vr;

  supportEl.textContent =
    `WebXR: MR/AR ${ar ? 'YES' : 'NO'} · VR ${vr ? 'YES' : 'NO'}`;
}

renderer.setAnimationLoop((time, frame) => {
  updateHandTips(frame);

  // Slight pulse for placed corner points.
  for (let i = 0; i < pointMarkers.length; i++) {
    const scale =
      1 + Math.sin(time * 0.004 + i) * 0.12;
    pointMarkers[i].scale.setScalar(scale);
  }

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect =
    window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
});

detectSupport();
