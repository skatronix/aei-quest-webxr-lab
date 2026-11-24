
import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#xr-canvas');
const supportEl = document.querySelector('#support');
const arButton = document.querySelector('#enter-ar');
const vrButton = document.querySelector('#enter-vr');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030407);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0, 1.55, 2.0);

const stringGroup = new THREE.Group();
scene.add(stringGroup);

const STRINGS = [
  { y: 1.05, note: 48, color: 0x77f6ff },
  { y: 1.20, note: 55, color: 0x92eaff },
  { y: 1.35, note: 60, color: 0xd7f8ff },
  { y: 1.50, note: 63, color: 0xffb6e6 },
  { y: 1.65, note: 67, color: 0xff7fd7 },
];

const strings = [];
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const closest = new THREE.Vector3();
const AB = new THREE.Vector3();
const AP = new THREE.Vector3();

function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function pluckAudio(note, velocity) {
  ensureAudio();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(midiToHz(note), now);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1500 + velocity * 2500, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08 + velocity * 0.18, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

  osc.connect(filter).connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.8);
}

function createString(spec, index) {
  const x1 = -0.58;
  const x2 = 0.58;
  const z = -0.82 - index * 0.025;

  const positions = new Float32Array([
    x1, spec.y, z,
    0, spec.y, z,
    x2, spec.y, z,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: spec.color,
    transparent: true,
    opacity: 0.65,
  });

  const line = new THREE.Line(geometry, material);
  stringGroup.add(line);

  const left = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 12, 8),
    new THREE.MeshBasicMaterial({ color: spec.color })
  );
  const right = left.clone();
  left.position.set(x1, spec.y, z);
  right.position.set(x2, spec.y, z);
  stringGroup.add(left, right);

  const obj = {
    ...spec, line, geometry, material,
    a: new THREE.Vector3(x1, spec.y, z),
    b: new THREE.Vector3(x2, spec.y, z),
    energy: 0,
    phase: 0,
    lastPluck: -9999,
    wasNear: [false, false],
  };
  strings.push(obj);
}

STRINGS.forEach(createString);

const inputState = [
  { connected: false, handedness: 'unknown', hand: false },
  { connected: false, handedness: 'unknown', hand: false },
];
const controllers = [];
const inputPos = [new THREE.Vector3(), new THREE.Vector3()];
const prevPos = [new THREE.Vector3(), new THREE.Vector3()];
const motionFrom = [new THREE.Vector3(), new THREE.Vector3()];
const velocity = [new THREE.Vector3(), new THREE.Vector3()];
const hasPrev = [false, false];

function makeInput(index) {
  const controller = renderer.xr.getController(index);
  controller.addEventListener('connected', (event) => {
    inputState[index] = {
      connected: true,
      handedness: event.data?.handedness || 'unknown',
      hand: Boolean(event.data?.hand),
    };
    hasPrev[index] = false;
  });
  controller.addEventListener('disconnected', () => {
    inputState[index].connected = false;
    hasPrev[index] = false;
  });
  scene.add(controller);
  controllers.push(controller);

  const hand = renderer.xr.getHand(index);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 12, 8),
    new THREE.MeshBasicMaterial({ color: index === 0 ? 0x77f6ff : 0xff7fd7 })
  );
  tip.name = 'tip-marker';
  hand.add(tip);
  scene.add(hand);
}

makeInput(0);
makeInput(1);

let session = null;
let lastTime = performance.now();
let pluckCount = 0;

function pointSegmentDistance(p, p0, p1, target) {
  AB.copy(p1).sub(p0);
  AP.copy(p).sub(p0);
  const denom = AB.lengthSq();
  const t = denom > 0 ? THREE.MathUtils.clamp(AP.dot(AB) / denom, 0, 1) : 0;
  target.copy(p0).addScaledVector(AB, t);
  return target.distanceTo(p);
}

function getIndexTip(index, frame, out) {
  if (!session || !frame) return false;
  const refSpace = renderer.xr.getReferenceSpace();
  if (!refSpace) return false;

  const handedness = inputState[index].handedness;
  const source = Array.from(session.inputSources).find(
    (s) => s.hand && s.handedness === handedness
  );
  if (!source?.hand) return false;

  const joint = source.hand.get('index-finger-tip');
  if (!joint) return false;

  const pose = frame.getJointPose(joint, refSpace);
  if (!pose) return false;

  out.set(
    pose.transform.position.x,
    pose.transform.position.y,
    pose.transform.position.z
  );
  return true;
}

function updateInputs(dt, frame) {
  for (let i = 0; i < 2; i++) {
    if (!inputState[i].connected) continue;

    const gotHand = inputState[i].hand && getIndexTip(i, frame, inputPos[i]);
    if (!gotHand) controllers[i].getWorldPosition(inputPos[i]);

    if (hasPrev[i] && dt > 0.0001) {
      motionFrom[i].copy(prevPos[i]);
      velocity[i].copy(inputPos[i]).sub(prevPos[i]).multiplyScalar(1 / dt);
      velocity[i].clampLength(0, 4);
    } else {
      motionFrom[i].copy(inputPos[i]);
      velocity[i].set(0,0,0);
      hasPrev[i] = true;
    }
    prevPos[i].copy(inputPos[i]);
  }
}

function pluckString(s, handIndex, nowMs, distance) {
  const speed = velocity[handIndex].length();
  if (nowMs - s.lastPluck < 120) return;
  if (speed < 0.12) return;

  s.lastPluck = nowMs;
  s.energy = Math.min(1.0, 0.25 + speed * 0.45);
  s.phase = 0;
  pluckCount += 1;
  pluckAudio(s.note, Math.min(1, speed / 1.3));
}

function sweptPointSegmentHit(from, to, s, radius) {
  const travel = from.distanceTo(to);
  const steps = THREE.MathUtils.clamp(Math.ceil(travel / 0.012), 1, 24);
  let minDistance = Infinity;

  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    const d = pointSegmentDistance(p, s.a, s.b, closest);
    if (d < minDistance) minDistance = d;
    if (d < radius) return { hit: true, distance: d };
  }

  return { hit: false, distance: minDistance };
}

function testPlucks(nowMs) {
  const HIT_RADIUS = 0.042;

  for (const s of strings) {
    for (let i = 0; i < 2; i++) {
      if (!inputState[i].connected) continue;

      const currentDistance = pointSegmentDistance(inputPos[i], s.a, s.b, closest);
      const nearNow = currentDistance < HIT_RADIUS;

      const sweep = sweptPointSegmentHit(
        motionFrom[i],
        inputPos[i],
        s,
        HIT_RADIUS
      );

      if (sweep.hit && !s.wasNear[i]) {
        pluckString(s, i, nowMs, sweep.distance);
      }

      s.wasNear[i] = nearNow;
    }
  }
}

function animateStrings(dt) {
  for (const s of strings) {
    s.energy *= Math.exp(-dt * 4.2);
    s.phase += dt * 26;

    const pos = s.geometry.attributes.position.array;
    const wobble = Math.sin(s.phase) * 0.045 * s.energy;
    pos[4] = s.y + wobble;
    s.geometry.attributes.position.needsUpdate = true;

    s.material.opacity = 0.42 + s.energy * 0.58;
  }
}

async function startXR(mode) {
  if (!navigator.xr || session) return;

  try {
    ensureAudio();
    session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'bounded-floor'],
    });

    document.body.classList.add('xr-active');
    scene.background = mode === 'immersive-ar' ? null : new THREE.Color(0x030407);
    await renderer.xr.setSession(session);

    session.addEventListener('end', () => {
      session = null;
      document.body.classList.remove('xr-active');
      scene.background = new THREE.Color(0x030407);
      hasPrev[0] = false;
      hasPrev[1] = false;
    }, { once: true });
  } catch (err) {
    supportEl.textContent = `Could not start ${mode}: ${err.message}`;
  }
}

arButton.addEventListener('click', () => startXR('immersive-ar'));
vrButton.addEventListener('click', () => startXR('immersive-vr'));

async function detectSupport() {
  if (!navigator.xr) {
    supportEl.textContent = 'WebXR unavailable. Quest Browser + HTTPS required.';
    return;
  }

  const [ar, vr] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
  ]);

  arButton.disabled = !ar;
  vrButton.disabled = !vr;
  supportEl.textContent = `WebXR: MR/AR ${ar ? 'YES' : 'NO'} · VR ${vr ? 'YES' : 'NO'}`;
}

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(0.05, Math.max(0.001, (time - lastTime) / 1000));
  lastTime = time;

  updateInputs(dt, frame);
  testPlucks(time);
  animateStrings(dt);

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

detectSupport();
