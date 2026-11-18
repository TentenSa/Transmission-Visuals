// Four schematic transmissions on one shaft axis (x), engine on the left, output on the right, the TCU in front.
// Only the selected type is shown (the others shrink away). frame(state, cam, o) poses the active one from the model.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SPEC, TYPES} from './model.js';

const V3 = THREE.Vector3;
export const COL = {bg: '#eceef0', ground: '#e6e8eb', red: '#d6182b', ink: '#16181b'};
const GROUND = -1.08;
const ACC = new THREE.Color(COL.red);
const TCU = {x: 0.1, y: -0.98, z: 1.0, w: 0.9, d: 0.42};

const M = () => ({
  metal: new THREE.MeshStandardMaterial({color: '#b8bdc3', metalness: 0.85, roughness: 0.45, envMapIntensity: 0.55}),
  dark: new THREE.MeshStandardMaterial({color: '#555b63', metalness: 0.7, roughness: 0.5, envMapIntensity: 0.5}),
  shaft: new THREE.MeshStandardMaterial({color: '#8f959c', metalness: 0.9, roughness: 0.38, envMapIntensity: 0.6}),
  steel: new THREE.MeshStandardMaterial({color: '#cfd3d8', metalness: 0.8, roughness: 0.46, envMapIntensity: 0.5}),
  cast: new THREE.MeshStandardMaterial({color: '#c9ccd0', metalness: 0.3, roughness: 0.7}),
  plastic: new THREE.MeshStandardMaterial({color: '#ecebe7', roughness: 0.75}),
  wire: new THREE.MeshStandardMaterial({color: '#3b4048', roughness: 0.6}),
  ink: new THREE.MeshStandardMaterial({color: COL.ink, roughness: 0.6}),
});
const glowMat = (base = '#8a7c68') => new THREE.MeshStandardMaterial({color: base, roughness: 0.8, metalness: 0.1, emissive: ACC, emissiveIntensity: 0});

function gearGeo(r, teeth, w, {internal = false, rOut = 0, hole = 0} = {}) {
  const sh = new THREE.Shape();
  const h = r * 0.09 + 0.006;
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const q = i % 4;
    const rr = internal ? (q === 1 || q === 2 ? r - h : r) : q === 1 || q === 2 ? r + h : r;
    if (i === 0) sh.moveTo(rr * Math.cos(a), rr * Math.sin(a));
    else sh.lineTo(rr * Math.cos(a), rr * Math.sin(a));
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
const ring = (rIn, rOut, w, seg = 56) => {
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
const teethFor = (r) => Math.max(10, Math.round(r * 110));

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 10, 22);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 60);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
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
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 8;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.position.copy(new V3(-0.3, 0.85, 0.42).normalize().multiplyScalar(8));
  scene.add(sun, sun.target, new THREE.HemisphereLight('#ffffff', '#cfd3d8', 0.7));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({color: COL.ground, roughness: 1}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND;
  scene.add(ground);
  const shade = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.ShadowMaterial({color: '#4a5260', opacity: 0.22, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = GROUND;
  shade.receiveShadow = true;
  scene.add(shade);

  const mat = M();
  const add = (parent, geo, m, f) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    o.receiveShadow = true;
    f?.(o);
    parent.add(o);
    return o;
  };
  const tube = (parent, pts, m = mat.wire, r = 0.008) => {
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    add(parent, new THREE.TubeGeometry(c, 48, r, 8), m);
  };

  // ------------------------------------------------------------ shared: engine stub and the TCU
  const common = new THREE.Group();
  scene.add(common);
  add(common, new THREE.BoxGeometry(0.7, 1.0, 0.9), mat.cast, (o) => o.position.set(-2.55, -0.25, 0));
  for (let i = 0; i < 4; i++) add(common, new THREE.BoxGeometry(0.72, 0.03, 0.92), mat.dark, (o) => o.position.set(-2.55, -0.55 + i * 0.22, 0));
  add(common, new THREE.BoxGeometry(0.2, 0.08, 0.7), mat.dark, (o) => o.position.set(-2.55, 0.29, 0));
  const flywheel = add(common, gearGeo(0.44, 60, 0.05, {hole: 0.04}), mat.dark, (o) => (o.position.x = -2.16));
  const tcu = new THREE.Group();
  tcu.position.set(TCU.x, TCU.y, TCU.z);
  common.add(tcu);
  add(tcu, new THREE.BoxGeometry(TCU.w, 0.1, TCU.d), mat.cast, (o) => (o.position.y = 0.0));
  for (let i = 0; i < 7; i++) add(tcu, new THREE.BoxGeometry(0.012, 0.03, TCU.d * 0.7), mat.cast, (o) => o.position.set(-0.36 + i * 0.12, 0.065, 0));
  add(tcu, new THREE.BoxGeometry(0.46, 0.07, 0.07), mat.plastic, (o) => o.position.set(0.1, 0.04, -TCU.d / 2 - 0.03));
  const tcuLed = new THREE.MeshStandardMaterial({color: '#2a2d31', emissive: ACC, emissiveIntensity: 0});
  add(tcu, new THREE.BoxGeometry(0.03, 0.01, 0.03), tcuLed, (o) => o.position.set(-0.36, 0.055, 0.14));
  const connAt = (i) => new V3(TCU.x + 0.1 - 0.18 + i * 0.09, TCU.y + 0.08, TCU.z - TCU.d / 2 - 0.07);
  // CAN to the engine
  tube(common, [new V3(TCU.x - TCU.w / 2, TCU.y + 0.02, TCU.z), new V3(-1.2, TCU.y + 0.02, TCU.z + 0.1), new V3(-2.2, -0.75, 0.6), new V3(-2.4, -0.6, 0.46)], new THREE.MeshStandardMaterial({color: '#7a7f86', roughness: 0.6}), 0.012);
  const outShaft = add(common, cylX(0.045, 0.5, 24), mat.shaft, (o) => (o.position.x = 1.45));
  add(outShaft, new THREE.BoxGeometry(0.35, 0.014, 0.03), mat.ink, (o) => o.position.set(0, 0.045, 0));
  const flange = add(common, cylX(0.12, 0.04, 6), mat.dark, (o) => (o.position.x = 1.72));

  const groups = {};
  const poses = {};
  const anchors = {};

  // the input from the flywheel along y = 0
  const inputStub = (g, x0, x1) => {
    const s = add(g, cylX(0.034, x1 - x0, 20), mat.shaft, (o) => (o.position.x = (x0 + x1) / 2));
    add(s, new THREE.BoxGeometry((x1 - x0) * 0.5, 0.012, 0.028), mat.ink, (o) => o.position.set(0, 0.034, 0));
    return s;
  };
  const converter = (g, x) => {
    const c = new THREE.Group();
    c.position.x = x;
    g.add(c);
    const prof = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI;
      prof.push(new THREE.Vector2(0.24 + 0.19 * Math.sin(a), -0.12 * Math.cos(a)));
    }
    prof.push(new THREE.Vector2(0.05, 0.12), new THREE.Vector2(0.05, -0.12));
    add(c, new THREE.LatheGeometry(prof, 56).rotateZ(-Math.PI / 2), mat.metal);
    for (let i = 0; i < 8; i++)
      add(c, new THREE.BoxGeometry(0.13, 0.03, 0.02), mat.dark, (o) => {
        const a = (i / 8) * Math.PI * 2;
        o.position.set(-0.13, 0.4 * Math.cos(a), 0.4 * Math.sin(a));
        o.rotation.x = a;
      });
    return c;
  };
  const solenoidRow = (g, xs, z0) => {
    const vb = add(g, new THREE.BoxGeometry(xs.length * 0.24 + 0.2, 0.14, 0.5), mat.cast, (o) => o.position.set((xs[0] + xs[xs.length - 1]) / 2, -0.66, 0));
    void vb;
    return xs.map((x, i) => {
      const cm = glowMat('#3d434b');
      add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.14, 24).rotateX(Math.PI / 2), cm, (o) => o.position.set(x, -0.66, z0 + 0.07));
      add(g, new THREE.BoxGeometry(0.055, 0.045, 0.04), mat.plastic, (o) => o.position.set(x, -0.66, z0 + 0.16));
      tube(g, [new V3(x, -0.64, z0 + 0.18), new V3(x, -0.6, z0 + 0.25), new V3((x + connAt(i).x) / 2, -0.75, 0.6), connAt(i)]);
      return cm;
    });
  };

  // ------------------------------------------------------------ AT
  {
    const g = new THREE.Group();
    scene.add(g);
    groups.AT = g;
    const inS = inputStub(g, -2.1, 0.95);
    const tc = converter(g, -1.55);
    const sets = [-0.45, 0.45].map((x) => {
      const s = new THREE.Group();
      s.position.x = x;
      g.add(s);
      const sunG = add(s, gearGeo(0.085, 14, 0.13, {hole: 0.036}), mat.steel);
      const ringG = add(s, gearGeo(0.3, 46, 0.14, {internal: true, rOut: 0.345}), mat.metal);
      const car = new THREE.Group();
      s.add(car);
      const pl = [];
      for (let i = 0; i < 4; i++) {
        const p = add(car, gearGeo(0.095, 16, 0.12, {hole: 0.016}), mat.cast);
        const a = (i / 4) * Math.PI * 2;
        p.position.set(0, 0.197 * Math.cos(a), 0.197 * Math.sin(a));
        pl.push(p);
      }
      return {sunG, ringG, car, pl};
    });
    // five shift elements, as on the first page: three closed per gear
    const EL = ['A', 'B', 'C', 'D', 'E'];
    const ELX = {A: -1.05, B: -0.85, C: 0.0, D: 0.82, E: 1.0};
    const packs = EL.map((e) => {
      const brake = e === 'A' || e === 'B';
      const [ri, ro] = brake ? [0.36, 0.45] : [0.16, 0.26];
      const pg = new THREE.Group();
      pg.position.x = ELX[e];
      g.add(pg);
      const fm = glowMat();
      const plates = [];
      for (let i = 0; i < 5; i++) plates.push(add(pg, ring(i % 2 ? ri + 0.012 : ri, i % 2 ? ro : ro - 0.012, 0.011, 44), i % 2 ? fm : mat.steel));
      return {pg, fm, plates};
    });
    const sols = solenoidRow(g, [-0.55, -0.3, -0.05, 0.2, 0.45, 0.7], 0.25);
    poses.AT = (s) => {
      tc.rotation.x = s.angEng;
      inS.rotation.x = s.angIn;
      const R = 46 / 14;
      for (const st of sets) {
        st.sunG.rotation.x = s.angIn;
        st.ringG.rotation.x = s.angOut;
        const c = (s.angIn + R * s.angOut) / (1 + R);
        st.car.rotation.x = c;
        for (const p of st.pl) p.rotation.x = (-(s.angIn - c) * 14) / 16;
      }
      const ENG = ['ABC', 'ABE', 'BCE', 'BDE', 'BCD', 'CDE', 'ACD', 'ADE'];
      EL.forEach((e, i) => {
        const was = ENG[s.gear - 1].includes(e);
        const will = ENG[s.next - 1].includes(e);
        let k = was ? 1 : 0;
        if (s.ph >= 0 && was && !will) k = s.a1;
        if (s.ph >= 0 && !was && will) k = s.a2;
        const p = packs[i];
        p.fm.emissiveIntensity = 0.85 * k;
        p.fm.color.set(k > 0.05 ? '#9a5a52' : '#8a7c68');
        const gap = 0.005 + 0.012 * (1 - k);
        p.plates.forEach((pl, j) => (pl.position.x = (j - 2) * (0.011 + gap)));
        sols[i].emissiveIntensity = 0.9 * k;
      });
      sols[5].emissiveIntensity = 0.9 * s.a3;
    };
    anchors.AT = {
      conv: [new V3(-1.55, 0.44, 0), 'Torque converter', 'launch device · lock-up clutch'],
      packs: [new V3(0.0, 0.27, 0), 'Clutches and brakes', '3 of 5 closed per gear'],
      sets: [new V3(0.45, 0.35, 0), 'Planetary gearsets', 'ratios without moving gears'],
      sols: [new V3(0.2, -0.62, 0.42), 'Pressure solenoids', 'one per element'],
    };
  }

  // ------------------------------------------------------------ CVT
  {
    const g = new THREE.Group();
    scene.add(g);
    groups.CVT = g;
    const inS = inputStub(g, -2.1, -0.05);
    const tc = converter(g, -1.55);
    const YS = -0.62; // secondary axis
    const XP = 0.05;
    const C = 0.42; // r_primary + r_secondary
    const RMAX = 0.36;
    const TAN = Math.tan((11 * Math.PI) / 180);
    const sheave = (sgn) => {
      // a cone face: radius 0..RMAX, thicker at the hub, facing ±x
      const prof = [new THREE.Vector2(0.03, 0), new THREE.Vector2(0.03, 0.12), new THREE.Vector2(0.06, 0.12), new THREE.Vector2(RMAX, 0.12 - RMAX * TAN * 1.6), new THREE.Vector2(RMAX, 0.0)];
      const geo = new THREE.LatheGeometry(prof, 64).rotateZ(-Math.PI / 2);
      if (sgn < 0) geo.scale(-1, 1, 1);
      return geo;
    };
    const pulley = (y) => {
      const p = new THREE.Group();
      p.position.set(XP, y, 0);
      g.add(p);
      const sm1 = mat.steel.clone();
      sm1.side = THREE.DoubleSide;
      sm1.transparent = true;
      sm1.opacity = 0.5;
      sm1.depthWrite = false;
      const sm2 = mat.metal.clone();
      sm2.side = THREE.DoubleSide;
      sm2.transparent = true;
      sm2.opacity = 0.5;
      sm2.depthWrite = false;
      const fixed = add(p, sheave(1), sm1, (o) => (o.position.x = 0.02));
      const mov = add(p, sheave(-1), sm2);
      return {p, fixed, mov};
    };
    const prim = pulley(0);
    const sec = pulley(YS);
    const secShaft = add(g, cylX(0.04, 1.6, 20), mat.shaft, (o) => o.position.set(0.7, YS, 0));
    add(secShaft, new THREE.BoxGeometry(0.4, 0.012, 0.03), mat.ink, (o) => o.position.set(0, 0.04, 0));
    const LINKS = 96;
    const belt = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.018, 0.016), new THREE.MeshStandardMaterial({color: '#4a5058', metalness: 0.8, roughness: 0.4}), LINKS);
    belt.castShadow = true;
    belt.frustumCulled = false;
    g.add(belt);
    const ratioValve = glowMat('#3d434b');
    const clampValve = glowMat('#3d434b');
    const luValve = glowMat('#3d434b');
    add(g, new THREE.BoxGeometry(0.9, 0.14, 0.45), mat.cast, (o) => o.position.set(-0.75, -0.75, 0));
    [ratioValve, clampValve, luValve].forEach((m, i) => {
      const x = -1.05 + i * 0.3;
      add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.14, 24).rotateX(Math.PI / 2), m, (o) => o.position.set(x, -0.75, 0.3));
      add(g, new THREE.BoxGeometry(0.055, 0.045, 0.04), mat.plastic, (o) => o.position.set(x, -0.75, 0.39));
      tube(g, [new V3(x, -0.73, 0.41), new V3(x, -0.72, 0.5), new V3(x * 0.6, -0.85, 0.62), connAt(i + 1)]);
    });
    const Mx = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const P = new V3();
    const S1 = new V3(1, 1, 1);
    const ax = new V3(1, 0, 0);
    // path round two circles in the y-z plane (centres y = 0 and y = YS), external tangents
    const beltPath = (r1, r2) => {
      const d = -YS;
      const phi = Math.asin((r1 - r2) / d);
      // contact angles measured from +z toward +y around each centre
      const a1s = phi; // top circle: tangent points on the ±z sides, wrapping over the top
      const segs = [];
      // top arc: from angle (π - φ) ... wrap over the top (+y) ... to φ, centre (0)
      segs.push({type: 'arc', cy: 0, r: r1, a0: Math.PI - a1s, a1: a1s, len: r1 * (Math.PI + 2 * phi)});
      const tA = [r1 * Math.cos(a1s), r1 * Math.sin(a1s)];
      const tB = [r2 * Math.cos(a1s), YS + r2 * Math.sin(a1s)];
      segs.push({type: 'line', p0: tA, p1: tB, len: Math.hypot(tA[0] - tB[0], tA[1] - tB[1])});
      segs.push({type: 'arc', cy: YS, r: r2, a0: a1s, a1: -Math.PI - a1s, len: r2 * (Math.PI - 2 * phi)});
      const tC = [r2 * Math.cos(Math.PI - a1s), YS + r2 * Math.sin(Math.PI - a1s)];
      const tD = [r1 * Math.cos(Math.PI - a1s), r1 * Math.sin(Math.PI - a1s)];
      segs.push({type: 'line', p0: tC, p1: tD, len: Math.hypot(tC[0] - tD[0], tC[1] - tD[1])});
      const L = segs.reduce((a, s) => a + s.len, 0);
      return {segs, L};
    };
    const at = (path, u) => {
      let s = u * path.L;
      for (const g0 of path.segs) {
        if (s <= g0.len) {
          const k = s / g0.len;
          if (g0.type === 'line') return [[g0.p0[0] + (g0.p1[0] - g0.p0[0]) * k, g0.p0[1] + (g0.p1[1] - g0.p0[1]) * k], Math.atan2(g0.p1[1] - g0.p0[1], g0.p1[0] - g0.p0[0])];
          const a = g0.a0 + (g0.a1 - g0.a0) * k;
          return [[g0.r * Math.cos(a), g0.cy + g0.r * Math.sin(a)], a + (g0.a1 < g0.a0 ? -Math.PI / 2 : Math.PI / 2)];
        }
        s -= g0.len;
      }
      return [[0, 0], 0];
    };
    poses.CVT = (s) => {
      tc.rotation.x = s.angEng;
      inS.rotation.x = s.angIn;
      const ratio = s.ratio / SPEC.CVT.fd;
      const r1 = C / (1 + ratio);
      const r2 = C - r1;
      // the movable sheave closes to push the belt out; gap = 2 × (RMAX − r) × tan
      prim.mov.position.x = -0.02 - 1.6 * (RMAX - r1) * TAN * 0.9;
      sec.mov.position.x = -0.02 - 1.6 * (RMAX - r2) * TAN * 0.9;
      prim.p.rotation.x = s.angIn;
      sec.p.rotation.x = s.angIn / ratio;
      secShaft.rotation.x = s.angIn / ratio;
      const path = beltPath(r1 + 0.008, r2 + 0.008);
      const run = ((s.belt * r1) / path.L) % 1;
      for (let i = 0; i < LINKS; i++) {
        const [[z, y], ang] = at(path, (((i / LINKS - run) % 1) + 1) % 1);
        P.set(XP + 0.01, y, z);
        Q.setFromAxisAngle(ax, -ang);
        Mx.compose(P, Q, S1);
        belt.setMatrixAt(i, Mx);
      }
      belt.instanceMatrix.needsUpdate = true;
      ratioValve.emissiveIntensity = 0.3 + 0.6 * (1 - s.a1);
      clampValve.emissiveIntensity = 0.9 * s.a2;
      luValve.emissiveIntensity = 0.9 * s.a3;
    };
    anchors.CVT = {
      conv: [new V3(-1.55, 0.44, 0), 'Torque converter', 'launch device'],
      prim: [new V3(XP, 0.36, 0), 'Primary pulley', 'sets the ratio'],
      sec: [new V3(XP + 0.08, YS - 0.2, 0.25), 'Secondary pulley', 'clamps the belt'],
      belt: [new V3(XP, -0.3, 0.32), 'Push belt', 'steel elements, no steps'],
      valves: [new V3(-0.75, -0.7, 0.4), 'Ratio and clamp valves', 'hydraulic control'],
    };
  }

  // ------------------------------------------------------------ layshaft boxes: AMT and DCT
  const C = 0.42; // centre distance input → output shaft
  const YO = -0.48;
  const layshaft = (g, ratios, xs, inShafts) => {
    const pairs = ratios.map((r, i) => {
      const rin = C / (1 + r);
      const rout = C - rin;
      const gi = add(g, gearGeo(rin - 0.006, teethFor(rin), 0.06, {hole: 0.03}), mat.steel, (o) => (o.position.x = xs[i]));
      const gm = glowMat('#c9ccd0');
      gm.metalness = 0.5;
      const go = add(g, gearGeo(rout - 0.006, teethFor(rout), 0.06, {hole: 0.04}), gm, (o) => o.position.set(xs[i], YO, 0));
      return {gi, go, gm, r, rin, rout, sh: inShafts(i)};
    });
    return pairs;
  };
  const sleeve = (g, x) => add(g, ring(0.05, 0.085, 0.05, 32), mat.dark, (o) => o.position.set(x, YO, 0));
  const fork = (g, x) => {
    const f = new THREE.Group();
    f.position.set(x, YO, 0);
    g.add(f);
    add(f, new THREE.BoxGeometry(0.02, 0.36, 0.03), mat.cast, (o) => o.position.set(0, -0.23, 0.0));
    return f;
  };

  // ------------------------------------------------------------ AMT
  {
    const g = new THREE.Group();
    scene.add(g);
    groups.AMT = g;
    const R = SPEC.AMT.ratios;
    const xs = [-0.95, -0.62, -0.18, 0.15, 0.58, 0.91];
    const inS = inputStub(g, -2.1, 1.1);
    const outS = add(g, cylX(0.04, 2.5, 20), mat.shaft, (o) => o.position.set(0.15, YO, 0));
    add(outS, new THREE.BoxGeometry(0.6, 0.012, 0.028), mat.ink, (o) => o.position.set(0, 0.04, 0));
    // dry clutch: flywheel face, disc, pressure plate
    const disc = add(g, ring(0.08, 0.34, 0.025, 56), glowMat('#8a7c68'), (o) => (o.position.x = -2.03));
    const plate = add(g, ring(0.1, 0.38, 0.06, 56), mat.metal, (o) => (o.position.x = -1.95));
    const clAct = glowMat('#3d434b');
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.22, 24), clAct, (o) => o.position.set(-1.75, 0.5, 0));
    const clRod = add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 12), mat.shaft, (o) => o.position.set(-1.83, 0.3, 0));
    const pairs = layshaft(g, R, xs, () => 0);
    const sleeves = [0, 1, 2].map((k) => sleeve(g, (xs[2 * k] + xs[2 * k + 1]) / 2));
    const forks = sleeves.map((s) => fork(g, s.position.x));
    const shAct = glowMat('#3d434b');
    add(g, new THREE.BoxGeometry(0.5, 0.16, 0.22), shAct, (o) => o.position.set(0.0, YO - 0.48, -0.15));
    add(g, cylX(0.012, 1.9, 8), mat.shaft, (o) => o.position.set(-0.05, YO - 0.41, 0));
    tube(g, [new V3(-1.75, 0.62, 0.05), new V3(-1.5, 0.7, 0.4), new V3(-0.9, -0.4, 0.8), connAt(1)]);
    tube(g, [new V3(0.0, YO - 0.4, -0.04), new V3(0.15, -0.95, 0.3), connAt(2)]);
    poses.AMT = (s) => {
      inS.rotation.x = s.angIn;
      disc.rotation.x = s.angIn;
      plate.rotation.x = s.angEng;
      outS.rotation.x = -s.angOut;
      const open = 1 - s.a1;
      plate.position.x = -1.95 + 0.06 * open;
      disc.material.emissiveIntensity = 0.7 * s.a1;
      clRod.position.y = 0.3 + 0.06 * open;
      clAct.emissiveIntensity = 0.9 * open;
      shAct.emissiveIntensity = 0.9 * s.a2;
      pairs.forEach((p, i) => {
        p.gi.rotation.x = s.angIn;
        p.go.rotation.x = -s.angIn / p.r;
        const on = s.sel === i + 1 && s.a1 > 0.05;
        p.gm.emissiveIntensity = on ? 0.6 * s.a1 : 0;
      });
      sleeves.forEach((sl, k) => {
        const lo = 2 * k + 1;
        const x0 = (xs[2 * k] + xs[2 * k + 1]) / 2;
        let off = 0;
        if (s.sel === lo) off = -1;
        if (s.sel === lo + 1) off = 1;
        sl.position.x = x0 + off * 0.1;
        sl.rotation.x = -s.angOut;
        forks[k].position.x = sl.position.x;
      });
    };
    anchors.AMT = {
      clutch: [new V3(-2.0, 0.36, 0), 'Dry clutch', 'opened by an actuator'],
      clact: [new V3(-1.75, 0.62, 0), 'Clutch actuator', 'electric or hydraulic'],
      gears: [new V3(0.15, 0.12, 0), 'Gear pairs', 'always in mesh'],
      sleeve: [new V3(-0.4, YO - 0.1, 0.1), 'Shift sleeves', 'lock one gear to the shaft'],
      shact: [new V3(0.2, YO - 0.42, 0.0), 'Shift actuator', 'select and engage'],
    };
  }

  // ------------------------------------------------------------ DCT
  {
    const g = new THREE.Group();
    scene.add(g);
    groups.DCT = g;
    const R = SPEC.DCT.ratios;
    // even gears on the hollow outer shaft near the clutches, odd ones further out on the inner shaft
    const xs = {2: -1.25, 4: -0.95, 6: -0.65, 1: -0.15, 3: 0.2, 5: 0.55, 7: 0.88};
    const inner = inputStub(g, -2.1, 1.1);
    const outer = add(g, cylX(0.06, 0.95, 24), mat.metal, (o) => (o.position.x = -1.4));
    add(outer, new THREE.BoxGeometry(0.4, 0.014, 0.03), mat.ink, (o) => o.position.set(0, 0.06, 0));
    const outS = add(g, cylX(0.04, 2.6, 20), mat.shaft, (o) => o.position.set(0.0, YO, 0));
    add(outS, new THREE.BoxGeometry(0.6, 0.012, 0.028), mat.ink, (o) => o.position.set(0, 0.04, 0));
    // two clutches: K1 (odd) outer ring, K2 (even) inner ring
    const k1m = glowMat();
    const k2m = glowMat('#7c7468');
    const k1 = [];
    const k2 = [];
    for (let i = 0; i < 5; i++) {
      k1.push(add(g, ring(0.28, 0.4, 0.012, 48), i % 2 ? k1m : mat.steel, (o) => (o.position.x = -1.98 + i * 0.022)));
      k2.push(add(g, ring(0.12, 0.24, 0.012, 48), i % 2 ? k2m : mat.steel, (o) => (o.position.x = -1.98 + i * 0.022)));
    }
    add(g, ring(0.41, 0.44, 0.16, 56), mat.metal, (o) => (o.position.x = -1.94));
    const order = [1, 2, 3, 4, 5, 6, 7];
    const ratios = order.map((n) => R[n - 1]);
    const pairs = layshaft(g, ratios, order.map((n) => xs[n]), (i) => (order[i] % 2 ? 'odd' : 'even'));
    // sleeves: even (2|4 between, 6 alone), odd (1|3, 5|7)
    const SL = [
      {lo: 2, hi: 4},
      {lo: 6, hi: 0},
      {lo: 1, hi: 3},
      {lo: 5, hi: 7},
    ];
    const sleeves = SL.map((d) => sleeve(g, d.hi ? (xs[d.lo] + xs[d.hi]) / 2 : xs[d.lo] + 0.16));
    const forks = sleeves.map((sl) => fork(g, sl.position.x));
    const act1 = glowMat('#3d434b');
    const act2 = glowMat('#3d434b');
    add(g, new THREE.BoxGeometry(0.4, 0.16, 0.22), act2, (o) => o.position.set(-1.05, YO - 0.48, -0.15));
    add(g, new THREE.BoxGeometry(0.4, 0.16, 0.22), act1, (o) => o.position.set(0.35, YO - 0.48, -0.15));
    const kAct = glowMat('#3d434b');
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.22, 24), kAct, (o) => o.position.set(-1.72, 0.52, 0));
    tube(g, [new V3(-1.72, 0.64, 0.05), new V3(-1.5, 0.7, 0.4), new V3(-0.9, -0.4, 0.8), connAt(1)]);
    tube(g, [new V3(-1.05, YO - 0.4, -0.04), new V3(-0.6, -0.95, 0.3), connAt(2)]);
    tube(g, [new V3(0.35, YO - 0.4, -0.04), new V3(0.4, -0.95, 0.3), connAt(3)]);
    poses.DCT = (s) => {
      // inner (odd) and outer (even) shafts turn with their selected gears; the clutches slip between engine and them
      const oddAng = s.sel % 2 ? s.angIn : s.angIn2;
      const evenAng = s.sel % 2 ? s.angIn2 : s.angIn;
      inner.rotation.x = oddAng;
      outer.rotation.x = evenAng;
      outS.rotation.x = -s.angOut;
      const c1 = s.a1;
      const c2 = s.a2;
      k1m.emissiveIntensity = 0.9 * c1;
      k2m.emissiveIntensity = 0.9 * c2;
      k1m.color.set(c1 > 0.05 ? '#9a5a52' : '#8a7c68');
      k2m.color.set(c2 > 0.05 ? '#9a5a52' : '#7c7468');
      k1.forEach((p, i) => (p.position.x = -1.98 + i * (0.014 + 0.01 * (1 - c1))));
      k2.forEach((p, i) => (p.position.x = -1.98 + i * (0.014 + 0.01 * (1 - c2))));
      kAct.emissiveIntensity = 0.5 + 0.4 * Math.abs(c1 - c2 < 0.98 ? 1 : 0);
      const selOdd = s.sel % 2 ? s.sel : s.sel2;
      const selEven = s.sel % 2 ? s.sel2 : s.sel;
      pairs.forEach((p, i) => {
        const n = order[i];
        const shAng = n % 2 ? oddAng : evenAng;
        p.gi.rotation.x = shAng;
        p.go.rotation.x = -shAng / p.r;
        const sel = n % 2 ? selOdd === n : selEven === n;
        const load = n % 2 ? c1 : c2;
        p.gm.emissiveIntensity = sel ? 0.15 + 0.55 * load : 0;
      });
      SL.forEach((d, k) => {
        const x0 = d.hi ? (xs[d.lo] + xs[d.hi]) / 2 : xs[d.lo] + 0.16;
        const want = d.lo % 2 ? selOdd : selEven;
        let off = 0;
        if (want === d.lo) off = d.hi ? -1 : -1;
        if (want === d.hi) off = 1;
        sleeves[k].position.x = x0 + off * (d.hi ? 0.1 : 0.1);
        sleeves[k].rotation.x = -s.angOut;
        forks[k].position.x = sleeves[k].position.x;
      });
      act1.emissiveIntensity = 0.3 + 0.5 * (s.ph >= 0 && s.sel % 2 === 0 ? 1 : 0);
      act2.emissiveIntensity = 0.3 + 0.5 * (s.ph >= 0 && s.sel % 2 === 1 ? 1 : 0);
    };
    anchors.DCT = {
      k: [new V3(-1.95, 0.44, 0), 'Two clutches', 'K1 odd gears · K2 even gears'],
      even: [new V3(-0.95, 0.16, 0), 'Even gears', 'hollow outer shaft'],
      odd: [new V3(0.2, 0.16, 0), 'Odd gears', 'inner shaft'],
      act: [new V3(-0.35, YO - 0.42, 0), 'Shift actuators', 'pre-select on the idle shaft'],
    };
  }
  for (const k of TYPES) anchors[k].tcu = [new V3(TCU.x + 0.3, TCU.y + 0.06, TCU.z + 0.1), 'TCU', 'same box, different job'];

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
  /** s: state of the active type; mix: {AT: 0..1, ...} visibility; cam radians */
  const frame = (s, mix, cam, T) => {
    for (const k of TYPES) {
      const v = mix[k];
      groups[k].visible = v > 0.01;
      const e = v * v * (3 - 2 * v);
      groups[k].scale.setScalar(0.85 + 0.15 * e);
      groups[k].position.y = -0.6 * (1 - e);
      if (groups[k].visible && s[k]) poses[k](s[k]);
    }
    const a = s.active;
    const oy = {AT: 0, CVT: -0.62, AMT: YO, DCT: YO}[a.type];
    outShaft.position.y = oy;
    flange.position.y = oy;
    flywheel.rotation.x = a.angEng;
    outShaft.rotation.x = -a.angOut;
    flange.rotation.x = -a.angOut;
    tcuLed.emissiveIntensity = 1 + 0.6 * Math.sin(T * 30);
    camera.position.set(cam.tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), cam.ty + cam.d * Math.sin(cam.el), cam.tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.updateMatrixWorld();
    composer.render();
  };
  const pv = new V3();
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
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
  return {renderer, scene, camera, composer, resize, frame, project, anchors, setQuality};
}
