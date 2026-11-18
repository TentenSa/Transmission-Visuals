// The geometry, built from code: a schematic 8-speed planetary automatic on its shaft axis (x), the valve body under
// it with one pressure-control solenoid per shift element, and the TCU in front: lid, board, MCU, solenoid drivers,
// connector, harness. frame(state, cam, opts) poses everything from the model's state and draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ELEMS, RATIOS} from './model.js';

const V3 = THREE.Vector3;
export const COL = {bg: '#eceef0', ground: '#e6e8eb', red: '#d6182b', blue: '#2f7fd6', ink: '#16181b'};
export const GROUND = -1.03;

// shaft-axis layout (x, metres in the model's scale)
export const X = {tc: -1.45, toneIn: -1.17, gs: [-0.85, -0.35, 0.15, 0.62], el: {A: -1.03, B: -0.6, C: -0.1, D: 0.38, E: 0.86}, toneOut: 1.22, flange: 1.82};
export const SOL_X = {A: -0.66, B: -0.4, C: -0.14, D: 0.12, E: 0.38, LU: 0.66};
const VB = {y: -0.62, z: 0.02, h: 0.15, d: 0.62};
export const TCU = {x: 0, y: -0.94, z: 0.86, w: 1.12, d: 0.5};

const mat = {
  metal: new THREE.MeshStandardMaterial({color: '#b8bdc3', metalness: 0.85, roughness: 0.45, envMapIntensity: 0.55}),
  dark: new THREE.MeshStandardMaterial({color: '#555b63', metalness: 0.7, roughness: 0.5, envMapIntensity: 0.5}),
  shaft: new THREE.MeshStandardMaterial({color: '#8f959c', metalness: 0.9, roughness: 0.38, envMapIntensity: 0.6}),
  steel: new THREE.MeshStandardMaterial({color: '#cfd3d8', metalness: 0.8, roughness: 0.46, envMapIntensity: 0.5}),
  cast: new THREE.MeshStandardMaterial({color: '#c9ccd0', metalness: 0.3, roughness: 0.7}),
  pcb: new THREE.MeshStandardMaterial({color: '#253029', roughness: 0.6, metalness: 0.1}),
  chip: new THREE.MeshStandardMaterial({color: '#1a1c1f', roughness: 0.45, metalness: 0.2}),
  plastic: new THREE.MeshStandardMaterial({color: '#ecebe7', roughness: 0.75}),
  pin: new THREE.MeshStandardMaterial({color: '#c9a45a', metalness: 0.9, roughness: 0.35}),
  lid: new THREE.MeshStandardMaterial({color: '#d9dce0', metalness: 0.55, roughness: 0.5, envMapIntensity: 0.6, transparent: true}),
  wire: new THREE.MeshStandardMaterial({color: '#3b4048', roughness: 0.6}),
  wireIn: new THREE.MeshStandardMaterial({color: '#6f8fb3', roughness: 0.6}),
  can: new THREE.MeshStandardMaterial({color: '#7a7f86', roughness: 0.6}),
};
const ACC = new THREE.Color(COL.red);
const BLUE = new THREE.Color(COL.blue);

/** A spur gear (or ring gear when internal) in the YZ plane, axis along x. */
function gearGeo(r, teeth, w, {internal = false, rOut = 0, hole = 0} = {}) {
  const sh = new THREE.Shape();
  const h = r * 0.09 + 0.006;
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const q = i % 4;
    const rr = internal ? (q === 1 || q === 2 ? r - h : r) : q === 1 || q === 2 ? r + h : r;
    const x = rr * Math.cos(a);
    const y = rr * Math.sin(a);
    if (i === 0) sh.moveTo(x, y);
    else sh.lineTo(x, y);
  }
  let shape = sh;
  if (internal) {
    shape = new THREE.Shape();
    shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    shape.holes.push(sh);
  } else if (hole > 0) {
    const hp = new THREE.Path();
    hp.absarc(0, 0, hole, 0, Math.PI * 2, true);
    sh.holes.push(hp);
  }
  const g = new THREE.ExtrudeGeometry(shape, {depth: w, bevelEnabled: false, curveSegments: 6});
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
const ring = (rIn, rOut, w, seg = 64) => {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const p = new THREE.Path();
  p.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  s.holes.push(p);
  const g = new THREE.ExtrudeGeometry(s, {depth: w, bevelEnabled: false, curveSegments: seg});
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
};
const cylX = (r, len, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);

const GHOST_VERT = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const GHOST_FRAG = `uniform vec3 uCol; uniform float uA; varying vec3 vN; varying vec3 vV;
  void main(){ float d = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0); float f = pow(1.0 - d, 2.2); gl_FragColor = vec4(uCol, uA * (0.025 + 0.32 * f)); }`;

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 9, 20);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 60);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  // studio environment: a few bright cards around a grey room
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#dfe2e6');
    const card = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    card(12, 12, new V3(0, 14, 3), 2.3);
    card(3, 14, new V3(-12, 4, 6), 2.6);
    card(3, 14, new V3(12, 4, -4), 1.8);
    card(18, 2, new V3(0, 2, 14), 1.4);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  const SUN = new V3(-0.3, 0.85, 0.42).normalize();
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 0.5, far: 20});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 8;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.position.copy(SUN).multiplyScalar(8);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#cfd3d8', 0.7));

  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({color: COL.ground, roughness: 1}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND;
  scene.add(ground);
  const shade = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.ShadowMaterial({color: '#4a5260', opacity: 0.22, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = GROUND;
  shade.receiveShadow = true;
  scene.add(shade);

  const root = new THREE.Group();
  scene.add(root);
  const add = (geo, m, parent = root, f) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    o.receiveShadow = true;
    f?.(o);
    parent.add(o);
    return o;
  };

  // ------------------------------------------------------------ the gear train
  // torque converter: a lathed donut on the engine side, turning with the engine
  const tc = new THREE.Group();
  root.add(tc);
  const tcProf = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    tcProf.push(new THREE.Vector2(0.3 + 0.21 * Math.sin(a), -0.14 * Math.cos(a)));
  }
  tcProf.push(new THREE.Vector2(0.06, 0.14), new THREE.Vector2(0.06, -0.14));
  const tcGeo = new THREE.LatheGeometry(tcProf, 64).rotateZ(-Math.PI / 2);
  add(tcGeo, mat.metal, tc);
  for (let i = 0; i < 8; i++)
    add(new THREE.BoxGeometry(0.15, 0.03, 0.02), mat.dark, tc, (o) => {
      const a = (i / 8) * Math.PI * 2;
      o.position.set(-0.155, 0.47 * Math.cos(a), 0.47 * Math.sin(a));
      o.rotation.x = a;
    });
  tc.position.x = X.tc;

  const inShaft = add(cylX(0.034, 2.62, 24), mat.shaft, root, (o) => (o.position.x = -0.38));
  const inMark = add(new THREE.BoxGeometry(0.5, 0.012, 0.03), new THREE.MeshStandardMaterial({color: COL.ink, roughness: 0.6}), inShaft, (o) => o.position.set(-0.4, 0.034, 0));
  void inMark;
  const toneIn = add(gearGeo(0.2, 36, 0.035, {hole: 0.03}), mat.steel, root, (o) => (o.position.x = X.toneIn));

  // four planetary gearsets: sun on the input, ring and carrier between; schematic, the kinematics per set exact
  const sets = X.gs.map((x) => {
    const g = new THREE.Group();
    g.position.x = x;
    root.add(g);
    const sun = add(gearGeo(0.085, 14, 0.13, {hole: 0.036}), mat.steel, g);
    const ringG = add(gearGeo(0.3, 46, 0.14, {internal: true, rOut: 0.345}), mat.metal, g);
    const carrier = new THREE.Group();
    g.add(carrier);
    add(ring(0.05, 0.27, 0.014), mat.dark, carrier, (o) => (o.position.x = 0.085));
    const planets = [];
    for (let i = 0; i < 4; i++) {
      const p = add(gearGeo(0.095, 16, 0.12, {hole: 0.016}), mat.cast, carrier);
      const a = (i / 4) * Math.PI * 2;
      const rc = 0.085 + 0.006 + 0.095 + 0.006;
      p.position.set(0, rc * Math.cos(a), rc * Math.sin(a));
      planets.push(p);
    }
    return {g, sun, ring: ringG, carrier, planets};
  });

  // five shift elements: brakes A and B to the case (outer), clutches C, D, E between shafts (inner)
  const elems = {};
  for (const e of ELEMS) {
    const brake = e === 'A' || e === 'B';
    const [rIn, rOut] = brake ? [0.37, 0.47] : [0.16, 0.27];
    const g = new THREE.Group();
    g.position.x = X.el[e];
    root.add(g);
    const plates = [];
    const fmat = new THREE.MeshStandardMaterial({color: '#8a7c68', roughness: 0.85, metalness: 0.05, emissive: ACC, emissiveIntensity: 0});
    for (let i = 0; i < 7; i++) {
      const steel = i % 2 === 0;
      const o = add(ring(steel ? rIn : rIn + 0.012, steel ? rOut - 0.012 : rOut, 0.012, 48), steel ? mat.steel : fmat, g);
      plates.push(o);
    }
    // the apply piston
    const piston = add(ring(rIn - 0.005, rOut + 0.005, 0.02, 48), mat.dark, g);
    elems[e] = {g, plates, piston, fmat};
  }

  const outShaft = add(cylX(0.045, 0.95, 24), mat.shaft, root, (o) => (o.position.x = 1.35));
  add(new THREE.BoxGeometry(0.4, 0.014, 0.03), new THREE.MeshStandardMaterial({color: COL.ink, roughness: 0.6}), outShaft, (o) => o.position.set(0.05, 0.045, 0));
  const toneOut = add(gearGeo(0.13, 24, 0.035, {hole: 0.04}), mat.steel, root, (o) => (o.position.x = X.toneOut));
  const flange = add(cylX(0.12, 0.04, 6), mat.dark, root, (o) => (o.position.x = X.flange));

  // the case as a glass shell
  const ghostMat = new THREE.ShaderMaterial({vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, uniforms: {uCol: {value: new THREE.Color('#5d6670')}, uA: {value: 1}}, transparent: true, depthWrite: false, side: THREE.DoubleSide});
  const caseProf = [[0.25, -1.68], [0.62, -1.66], [0.64, -1.25], [0.55, -1.12], [0.53, 0.98], [0.42, 1.08], [0.2, 1.16], [0.17, 1.62], [0.12, 1.66]].map(([r, x]) => new THREE.Vector2(r, x));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(caseProf, 72).rotateZ(-Math.PI / 2), ghostMat);
  shell.renderOrder = 5;
  root.add(shell);

  // ------------------------------------------------------------ valve body and solenoids
  const vb = add(new THREE.BoxGeometry(1.86, VB.h, VB.d), mat.cast, root, (o) => o.position.set(0, VB.y, VB.z));
  void vb;
  for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.008, VB.h * 0.6, VB.d * 0.8), mat.dark, root, (o) => o.position.set(-0.86 + i * 0.215, VB.y - 0.005, VB.z));
  const sols = {};
  const solZ = VB.z + VB.d / 2;
  for (const [k, x] of Object.entries(SOL_X)) {
    const g = new THREE.Group();
    g.position.set(x, VB.y, solZ);
    root.add(g);
    const cm = new THREE.MeshStandardMaterial({color: '#3d434b', roughness: 0.5, metalness: 0.4, emissive: ACC, emissiveIntensity: 0});
    add(new THREE.CylinderGeometry(0.048, 0.048, 0.15, 28).rotateX(Math.PI / 2), cm, g, (o) => (o.position.z = 0.075));
    add(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 28).rotateX(Math.PI / 2), mat.metal, g, (o) => (o.position.z = 0.01));
    add(new THREE.BoxGeometry(0.06, 0.05, 0.04), mat.plastic, g, (o) => o.position.set(0, 0, 0.17));
    sols[k] = {g, cm, tip: new V3(x, VB.y, solZ + 0.19)};
  }
  // sensors: turbine speed (input), output speed, oil temperature
  const sensor = (pos, rotX) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.x = rotX;
    root.add(g);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 20), mat.dark, g, (o) => (o.position.y = 0.08));
    add(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 6), mat.metal, g, (o) => (o.position.y = 0.14));
    add(new THREE.BoxGeometry(0.05, 0.05, 0.05), mat.plastic, g, (o) => (o.position.y = 0.19));
    return g;
  };
  const SENS = {
    tin: new V3(X.toneIn, 0.235, 0),
    tout: new V3(X.toneOut, 0.16, 0),
    temp: new V3(0.82, VB.y + VB.h / 2, VB.z + 0.12),
  };
  sensor(SENS.tin, 0);
  sensor(SENS.tout, 0);
  sensor(SENS.temp.clone().add(new V3(0, -0.02, 0)), 0);

  // ------------------------------------------------------------ the TCU
  const tcu = new THREE.Group();
  tcu.position.set(TCU.x, TCU.y, TCU.z);
  root.add(tcu);
  add(new THREE.BoxGeometry(TCU.w, 0.06, TCU.d), mat.cast, tcu, (o) => (o.position.y = -0.03));
  for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(TCU.w, 0.04, 0.012), mat.cast, tcu, (o) => o.position.set(0, 0.01, (i ? 1 : -1) * (TCU.d / 2 - 0.006)));
  for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(0.012, 0.04, TCU.d), mat.cast, tcu, (o) => o.position.set((i ? 1 : -1) * (TCU.w / 2 - 0.006), 0.01, 0));
  const board = new THREE.Group();
  tcu.add(board);
  add(new THREE.BoxGeometry(TCU.w - 0.06, 0.012, TCU.d - 0.06), mat.pcb, board, (o) => (o.position.y = 0.006));
  const mcuLed = new THREE.MeshStandardMaterial({color: '#2a2d31', emissive: ACC, emissiveIntensity: 0});
  const mcu = add(new THREE.BoxGeometry(0.17, 0.022, 0.17), mat.chip, board, (o) => o.position.set(-0.2, 0.023, 0.0));
  for (let s = 0; s < 4; s++)
    for (let i = 0; i < 12; i++) {
      const a = -0.077 + i * 0.014;
      add(new THREE.BoxGeometry(s < 2 ? 0.006 : 0.012, 0.004, s < 2 ? 0.012 : 0.006), mat.pin, board, (o) => {
        if (s === 0) o.position.set(-0.2 + a, 0.014, -0.091);
        if (s === 1) o.position.set(-0.2 + a, 0.014, 0.091);
        if (s === 2) o.position.set(-0.291, 0.014, a);
        if (s === 3) o.position.set(-0.109, 0.014, a);
      });
    }
  add(new THREE.BoxGeometry(0.02, 0.006, 0.02), mcuLed, board, (o) => o.position.set(-0.25, 0.036, -0.05));
  void mcu;
  // six low-side drivers, one per solenoid, in a row toward the valve body
  const drvLeds = [];
  for (let i = 0; i < 6; i++) {
    add(new THREE.BoxGeometry(0.07, 0.016, 0.05), mat.chip, board, (o) => o.position.set(0.04 + i * 0.075, 0.02, -0.13));
    const lm = new THREE.MeshStandardMaterial({color: '#2a2d31', emissive: ACC, emissiveIntensity: 0});
    add(new THREE.BoxGeometry(0.014, 0.005, 0.014), lm, board, (o) => o.position.set(0.04 + i * 0.075, 0.03, -0.1));
    drvLeds.push(lm);
  }
  // CAN transceiver, regulator, capacitors
  add(new THREE.BoxGeometry(0.06, 0.016, 0.04), mat.chip, board, (o) => o.position.set(-0.42, 0.02, 0.12));
  add(new THREE.BoxGeometry(0.08, 0.03, 0.06), mat.dark, board, (o) => o.position.set(0.1, 0.027, 0.12));
  for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 16), mat.metal, board, (o) => o.position.set(0.24 + i * 0.05, 0.037, 0.12));
  // connector on the back edge, toward the transmission
  const conn = new THREE.Group();
  tcu.add(conn);
  add(new THREE.BoxGeometry(0.56, 0.08, 0.08), mat.plastic, conn, (o) => o.position.set(0.18, 0.04, -TCU.d / 2 + 0.02));
  for (let i = 0; i < 14; i++) add(new THREE.BoxGeometry(0.012, 0.012, 0.03), mat.pin, conn, (o) => o.position.set(-0.07 + i * 0.037, 0.06, -TCU.d / 2 - 0.03));
  const lid = add(new THREE.BoxGeometry(TCU.w + 0.02, 0.03, TCU.d + 0.02), mat.lid, tcu, (o) => (o.position.y = 0.045));
  for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.012, 0.03, TCU.d * 0.7), mat.lid, lid, (o) => o.position.set(-0.44 + i * 0.11, 0.03, 0));

  // ------------------------------------------------------------ harness and signals
  const P0 = (x, y, z) => new V3(x, y, z);
  const connPt = (i) => new V3(TCU.x + 0.18 - 0.22 + i * 0.07, TCU.y + 0.09, TCU.z - TCU.d / 2 - 0.02);
  const lines = [];
  const tube = (pts, m, r = 0.009) => {
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    add(new THREE.TubeGeometry(c, 64, r, 8), m);
    return c;
  };
  // sensor lines (in, blue), solenoid lines (out, red)
  lines.push({key: 'tin', dir: 'in', curve: tube([SENS.tin.clone().add(P0(0, 0.21, 0)), P0(X.toneIn, 0.42, 0.25), P0(X.toneIn + 0.1, 0.2, 0.68), P0(-0.6, -0.55, 0.86), P0(-0.35, -0.75, 0.66), connPt(0)], mat.wireIn)});
  lines.push({key: 'tout', dir: 'in', curve: tube([SENS.tout.clone().add(P0(0, 0.21, 0)), P0(X.toneOut, 0.38, 0.25), P0(1.15, 0.0, 0.7), P0(0.9, -0.62, 0.78), P0(0.55, -0.78, 0.66), connPt(6)], mat.wireIn)});
  lines.push({key: 'temp', dir: 'in', curve: tube([SENS.temp.clone().add(P0(0, 0.2, 0)), P0(0.82, -0.3, 0.3), P0(0.75, -0.55, 0.5), connPt(5)], mat.wireIn)});
  for (const [k, s] of Object.entries(sols)) {
    const tip = s.tip;
    lines.push({key: k, dir: 'out', curve: tube([tip.clone().add(P0(0, 0.03, 0)), tip.clone().add(P0(0, 0.06, 0.06)), P0((tip.x + connPt(3).x) / 2, -0.62, 0.5), connPt(Object.keys(SOL_X).indexOf(k) + 1)], mat.wire, 0.007)});
  }
  // the vehicle CAN bus leaves toward the engine ECU
  const canEnd = P0(-2.25, TCU.y + 0.02, TCU.z);
  lines.push({key: 'can', dir: 'both', curve: tube([P0(TCU.x - TCU.w / 2 + 0.05, TCU.y + 0.02, TCU.z + 0.08), P0(-0.9, TCU.y + 0.05, TCU.z + 0.22), P0(-1.6, TCU.y + 0.02, TCU.z + 0.1), canEnd], mat.can, 0.012)});
  add(new THREE.BoxGeometry(0.16, 0.08, 0.1), mat.plastic, root, (o) => o.position.copy(canEnd));

  // pulses: instanced dots riding each line
  const N = 7;
  const dotGeo = new THREE.SphereGeometry(0.022, 12, 10);
  const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({color: '#ffffff', toneMapped: false}), lines.length * N + 8);
  dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((lines.length * N + 8) * 3), 3);
  dots.frustumCulled = false;
  scene.add(dots);
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const S = new V3();
  const Pp = new V3();

  // ------------------------------------------------------------ frame
  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const kick = (x) => Math.max(0, Math.min(1, x));

  /**
   * s: model state (+ T, seconds, for pulse phases); cam: {tx,ty,tz,az,el,d} radians;
   * o: {housing, explode, signals} each 0..1
   */
  const frame = (s, cam, o) => {
    // shafts and the converter
    tc.rotation.x = s.angEng;
    inShaft.rotation.x = s.angIn;
    toneIn.rotation.x = s.angIn;
    outShaft.rotation.x = s.angOut;
    toneOut.rotation.x = s.angOut;
    flange.rotation.x = s.angOut;
    // each set: sun = input, ring = output, carrier by the planetary relation (ring/sun teeth 46/14),
    // planets spin relative to the carrier
    const R = 46 / 14;
    for (const st of sets) {
      st.sun.rotation.x = s.angIn;
      st.ring.rotation.x = s.angOut;
      const c = (s.angIn + R * s.angOut) / (1 + R);
      st.carrier.rotation.x = c;
      const sp = -((s.angIn - c) * 14) / 16;
      for (const p of st.planets) p.rotation.x = sp;
    }
    // shift elements: the pack closes and lights with its pressure
    for (let i = 0; i < 5; i++) {
      const e = ELEMS[i];
      const k = kick(s.P[i] / 9);
      const el = elems[e];
      const gap = 0.006 + 0.012 * (1 - k);
      el.plates.forEach((p, j) => (p.position.x = (j - 3) * (0.012 + gap)));
      el.piston.position.x = 4 * (0.012 + gap) + 0.004;
      el.fmat.emissiveIntensity = 0.85 * k;
      el.fmat.color.set(k > 0.05 ? '#9a5a52' : '#8a7c68');
      sols[e].cm.emissiveIntensity = 0.9 * kick(s.P[i] / 14);
      drvLeds[i].emissiveIntensity = 1.6 * kick(s.P[i] / 10);
    }
    sols.LU.cm.emissiveIntensity = 0.9 * s.lock;
    drvLeds[5].emissiveIntensity = 1.6 * s.lock;
    mcuLed.emissiveIntensity = 1.2 + 0.8 * Math.sin(s.T * 40);

    // the TCU opens
    const ex = o.explode;
    // the lid lifts and swings out to the side so the board reads from above
    lid.position.y = 0.045 + 0.32 * ex;
    lid.position.z = -0.75 * ex;
    lid.rotation.x = -0.9 * ex;
    mat.lid.opacity = 1 - 0.45 * ex;
    board.position.y = 0.2 * ex;
    ghostMat.uniforms.uA.value = o.housing;
    shell.visible = o.housing > 0.01;

    // pulses
    let n = 0;
    const sig = o.signals;
    for (const L of lines) {
      let rate = 0;
      let amt = 0;
      let col = BLUE;
      if (L.key === 'tin') {
        rate = s.tur / 900;
        amt = s.tur > 30 ? 1 : 0;
      } else if (L.key === 'tout') {
        rate = s.out / 500;
        amt = s.out > 10 ? 1 : 0;
      } else if (L.key === 'temp') {
        rate = 0.25;
        amt = 0.7;
      } else if (L.key === 'can') {
        rate = 1.2;
        amt = 1;
        col = new THREE.Color('#5d6670');
      } else {
        const i = ELEMS.indexOf(L.key);
        const P = i >= 0 ? s.P[i] : s.lock * 10;
        amt = kick(P / 10);
        rate = 0.6 + amt * 0.9;
        col = ACC;
      }
      const ph = L.key === 'tin' ? s.angIn / (2 * Math.PI) / 18 : L.key === 'tout' ? s.angOut / (2 * Math.PI) / 4 : s.T * rate;
      for (let j = 0; j < N; j++) {
        let u = (ph + j / N) % 1;
        if (u < 0) u += 1;
        if (L.dir === 'in') u = 1 - u;
        L.curve.getPointAt(L.dir === 'out' ? 1 - u : u, Pp);
        const sc = sig * amt * (0.55 + 0.45 * Math.sin(Math.PI * u));
        S.setScalar(Math.max(0.0001, sc));
        M.compose(Pp, Q, S);
        dots.setMatrixAt(n, M);
        dots.setColorAt(n, col);
        n++;
      }
    }
    dots.count = n;
    dots.instanceMatrix.needsUpdate = true;
    dots.instanceColor.needsUpdate = true;

    camera.position.set(cam.tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), cam.ty + cam.d * Math.sin(cam.el), cam.tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    composer.render();
  };
  const pv = new V3();
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  // anchors for callouts (world)
  const anchors = {
    tcu: new V3(TCU.x + 0.45, TCU.y + 0.06, TCU.z + 0.1),
    mcu: new V3(TCU.x - 0.2, TCU.y + 0.03, TCU.z),
    drivers: new V3(TCU.x + 0.25, TCU.y + 0.03, TCU.z - 0.13),
    conn: new V3(TCU.x + 0.4, TCU.y + 0.09, TCU.z - TCU.d / 2),
    can: canEnd.clone(),
    sols: new V3(SOL_X.E, VB.y + 0.05, solZ + 0.1),
    vb: new V3(-0.8, VB.y - 0.05, VB.z + VB.d / 2),
    tin: SENS.tin.clone().add(new V3(0, 0.22, 0)),
    tout: SENS.tout.clone().add(new V3(0, 0.22, 0)),
    temp: SENS.temp.clone().add(new V3(0, 0.2, 0)),
    tc: new V3(X.tc, 0.5, 0),
    gs: new V3(X.gs[2], 0.3, 0.1),
    ...Object.fromEntries(ELEMS.map((e) => [e, new V3(X.el[e], e === 'A' || e === 'B' ? 0.47 : 0.27, 0)])),
    out: new V3(X.flange, 0.12, 0),
  };
  const setQuality = ({samples, shadow}) => {
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  void RATIOS;
  return {renderer, scene, camera, composer, resize, frame, project, anchors, size, setQuality};
}
