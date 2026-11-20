// An automated manual transaxle after a published cutaway drawing: bell housing with its bolted flange, the clutch
// inside it (1), the concentric slave cylinder and its pipe (2), the clutch actuator module with the TCU built in (3)
// and its master-cylinder piston (4), the shift shaft and finger (5), the gear actuator with the engage motor (6) and
// the select motor (7), a ribbed case cut open over the gears, a bolted end cover. Everything is built from code and
// posed from the model's state: clutch travel a1, sleeve throw a2 (-1..1), selected gate a3 (0..2).
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SPEC} from './model.js';

const V3 = THREE.Vector3;
export const COL = {bg: '#eceef0', ground: '#e4e6e9', red: '#d6182b', ink: '#16181b'};
const GROUND = -1.15;
const ACC = new THREE.Color(COL.red);

// layout (model units, x along the shafts, engine side negative)
export const L = {
  flangeX: -1.05,
  clutchX: -0.9,
  cscX: -0.66,
  caseX0: -0.6,
  caseX1: 0.95,
  inY: 0,
  outY: -0.36,
  gx: [-0.45, -0.22, 0.02, 0.25, 0.5, 0.72], // gear pairs 1..6
  railZ: -0.02,
  railY: [-0.07, -0.13, -0.19], // gates 1-2, 3-4, 5-6
  shaftX: 0.12,
  shaftZ: 0.1,
};

function gearGeo(r, teeth, w, {hole = 0, bevel = 0.006} = {}) {
  const sh = new THREE.Shape();
  const h = r * 0.08 + 0.006;
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const q = i % 4;
    const rr = q === 1 || q === 2 ? r + h : r;
    if (i === 0) sh.moveTo(rr * Math.cos(a), rr * Math.sin(a));
    else sh.lineTo(rr * Math.cos(a), rr * Math.sin(a));
  }
  if (hole > 0) {
    const hp = new THREE.Path();
    hp.absarc(0, 0, hole, 0, Math.PI * 2, true);
    sh.holes.push(hp);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: w - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6});
  g.translate(0, 0, -(w - 2 * bevel) / 2);
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
const cylZ = (r, len, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
const roundRect = (s, x0, x1, y0, y1, r) => {
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
};

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 9, 20);
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 60);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#d8dce1');
    const card = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    card(12, 12, new V3(0, 14, 3), 2.4);
    card(3, 14, new V3(-12, 4, 6), 2.8);
    card(3, 14, new V3(12, 4, -4), 1.6);
    card(18, 3, new V3(0, 1, 14), 1.6);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 1.0;
    pm.dispose();
  }
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 0.5, far: 20});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 8;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.position.copy(new V3(-0.45, 0.85, 0.35).normalize().multiplyScalar(8));
  scene.add(sun, sun.target, new THREE.HemisphereLight('#ffffff', '#cdd2d8', 0.65));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({color: COL.ground, roughness: 1}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND;
  scene.add(ground);
  const shade = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.ShadowMaterial({color: '#4a5260', opacity: 0.25, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = GROUND;
  shade.receiveShadow = true;
  scene.add(shade);

  // the case cut: remove the region where y > -0.5 and z > 0.12 (top-front quarter, as in the drawing)
  const cutY = new THREE.Plane(new V3(0, -1, 0), -0.5);
  const cutZ = new THREE.Plane(new V3(0, 0, -1), 0.12);
  const castCut = new THREE.MeshStandardMaterial({color: '#c3c7cc', metalness: 0.45, roughness: 0.62, envMapIntensity: 0.6, side: THREE.DoubleSide, clippingPlanes: [cutY, cutZ], clipIntersection: true});
  const mat = {
    cast: new THREE.MeshStandardMaterial({color: '#c3c7cc', metalness: 0.45, roughness: 0.62, envMapIntensity: 0.6}),
    castCut,
    darkCover: new THREE.MeshStandardMaterial({color: '#34383e', metalness: 0.35, roughness: 0.55, envMapIntensity: 0.5}),
    steel: new THREE.MeshStandardMaterial({color: '#cdd1d6', metalness: 0.85, roughness: 0.42, envMapIntensity: 0.55}),
    gear: new THREE.MeshStandardMaterial({color: '#9aa1a8', metalness: 0.85, roughness: 0.4, envMapIntensity: 0.6}),
    shaft: new THREE.MeshStandardMaterial({color: '#8f959c', metalness: 0.9, roughness: 0.38, envMapIntensity: 0.6}),
    dark: new THREE.MeshStandardMaterial({color: '#4c5258', metalness: 0.7, roughness: 0.5, envMapIntensity: 0.5}),
    black: new THREE.MeshStandardMaterial({color: '#1d1f22', metalness: 0.1, roughness: 0.6}),
    blackIn: new THREE.MeshStandardMaterial({color: '#2a2d31', metalness: 0.1, roughness: 0.7, side: THREE.DoubleSide}),
    brass: new THREE.MeshStandardMaterial({color: '#b08a4a', metalness: 0.9, roughness: 0.35, envMapIntensity: 0.6}),
    copper: new THREE.MeshStandardMaterial({color: '#b5642f', metalness: 0.7, roughness: 0.4}),
    pcb: new THREE.MeshStandardMaterial({color: '#2b3a31', roughness: 0.6}),
    loom: new THREE.MeshStandardMaterial({color: '#141517', roughness: 0.55}),
    plastic: new THREE.MeshStandardMaterial({color: '#e7e5e0', roughness: 0.7}),
    friction: new THREE.MeshStandardMaterial({color: '#6e5f4e', roughness: 0.9}),
    cutFace: new THREE.MeshStandardMaterial({color: '#e2e4e7', metalness: 0.2, roughness: 0.4}),
  };
  const glow = (base) => new THREE.MeshStandardMaterial({color: base, roughness: 0.6, metalness: 0.3, emissive: ACC, emissiveIntensity: 0});
  const add = (parent, geo, m, f) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    o.receiveShadow = true;
    f?.(o);
    parent.add(o);
    return o;
  };
  const tube = (parent, pts, m, r, seg = 64) => {
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    return add(parent, new THREE.TubeGeometry(c, seg, r, 10), m);
  };
  const root = new THREE.Group();
  scene.add(root);

  // ------------------------------------------------------------ bell housing: bolted flange and the cone
  const caseGroup = new THREE.Group();
  root.add(caseGroup);
  {
    // flange outline in (z, y) with lobes for the bolt bosses
    const pts = [
      [0.88, -0.2], [0.9, 0.18], [0.72, 0.5], [0.5, 0.7], [0.2, 0.8], [-0.1, 0.82], [-0.38, 0.74], [-0.62, 0.55], [-0.78, 0.25],
      [-0.82, -0.1], [-0.74, -0.42], [-0.55, -0.68], [-0.25, -0.86], [0.1, -0.9], [0.45, -0.82], [0.7, -0.6],
    ];
    const s = new THREE.Shape();
    pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
    s.closePath();
    const open = new THREE.Path();
    open.absarc(0, 0, 0.6, 0, Math.PI * 2, true);
    s.holes.push(open);
    const boss = [];
    pts.forEach(([z, y], i) => {
      if (i % 2) return;
      const k = 0.9;
      const hz = z * k;
      const hy = y * k;
      const h = new THREE.Path();
      h.absarc(hz, hy, 0.025, 0, Math.PI * 2, true);
      s.holes.push(h);
      boss.push([hz, hy]);
    });
    const geo = new THREE.ExtrudeGeometry(s, {depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 24});
    geo.rotateY(-Math.PI / 2);
    add(caseGroup, geo, mat.cast, (o) => (o.position.x = L.flangeX + 0.05));
    for (const [z, y] of boss) add(caseGroup, cylX(0.05, 0.1, 20), mat.cast, (o) => o.position.set(L.flangeX + 0.08, y, z));
    // the cone from the flange to the case, with radial ribs
    const cone = new THREE.LatheGeometry([new THREE.Vector2(0.64, 0), new THREE.Vector2(0.6, 0.15), new THREE.Vector2(0.52, 0.35), new THREE.Vector2(0.46, 0.45)], 72).rotateZ(-Math.PI / 2);
    add(caseGroup, cone, castCut, (o) => (o.position.x = L.flangeX + 0.05));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add(caseGroup, new THREE.BoxGeometry(0.42, 0.012, 0.05), castCut, (o) => {
        o.position.set(L.flangeX + 0.27, 0.6 * Math.cos(a), 0.6 * Math.sin(a));
        o.rotation.x = a;
        o.rotation.z = Math.cos(a) * 0.3;
        o.rotation.y = -Math.sin(a) * 0.3;
      });
    }
  }
  // ------------------------------------------------------------ the gearbox case, cut open over the gears
  {
    const s = new THREE.Shape();
    roundRect(s, -0.5, 0.52, -0.66, 0.32, 0.16);
    const h = new THREE.Path();
    roundRect(h, -0.465, 0.485, -0.625, 0.285, 0.13);
    s.holes.push(h);
    const geo = new THREE.ExtrudeGeometry(s, {depth: L.caseX1 - L.caseX0, bevelEnabled: false, curveSegments: 10});
    geo.rotateY(Math.PI / 2);
    geo.scale(1, 1, -1);
    add(caseGroup, geo, castCut, (o) => (o.position.x = L.caseX0));
    // ribs around the case
    for (const x of [-0.42, -0.1, 0.22, 0.54, 0.84]) {
      const r = new THREE.Shape();
      roundRect(r, -0.53, 0.55, -0.69, 0.35, 0.18);
      const rh = new THREE.Path();
      roundRect(rh, -0.5, 0.52, -0.66, 0.32, 0.16);
      r.holes.push(rh);
      const rg = new THREE.ExtrudeGeometry(r, {depth: 0.03, bevelEnabled: false, curveSegments: 10});
      rg.rotateY(Math.PI / 2);
      rg.scale(1, 1, -1);
      add(caseGroup, rg, castCut, (o) => (o.position.x = x));
    }
    // machined cut faces along the window edges
    add(caseGroup, new THREE.BoxGeometry(L.caseX1 - L.caseX0, 0.035, 0.012), mat.cutFace, (o) => o.position.set((L.caseX0 + L.caseX1) / 2, 0.303, 0.12));
    add(caseGroup, new THREE.BoxGeometry(L.caseX1 - L.caseX0, 0.012, 0.035), mat.cutFace, (o) => o.position.set((L.caseX0 + L.caseX1) / 2, -0.5, 0.503));
    // bolted end cover
    const cs = new THREE.Shape();
    roundRect(cs, -0.52, 0.54, -0.68, 0.34, 0.2);
    const cg = new THREE.ExtrudeGeometry(cs, {depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 12});
    cg.rotateY(Math.PI / 2);
    cg.scale(1, 1, -1);
    add(caseGroup, cg, mat.darkCover, (o) => (o.position.x = L.caseX1 + 0.01));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      add(caseGroup, cylX(0.022, 0.05, 6), mat.steel, (o) => o.position.set(L.caseX1 + 0.005, -0.17 + 0.47 * Math.sin(a), 0.01 + 0.5 * Math.cos(a)));
    }
  }

  // ------------------------------------------------------------ shafts and gears
  const R = SPEC.AMT.ratios;
  const CD = L.inY - L.outY;
  const inShaft = add(root, cylX(0.035, 2.0, 24), mat.shaft, (o) => (o.position.x = -0.15));
  add(inShaft, new THREE.BoxGeometry(0.5, 0.012, 0.026), mat.black, (o) => o.position.set(0.4, 0.035, 0));
  const outShaft = add(root, cylX(0.04, 1.5, 24), mat.shaft, (o) => o.position.set(0.15, L.outY, 0));
  add(outShaft, new THREE.BoxGeometry(0.5, 0.012, 0.026), mat.black, (o) => o.position.set(0.2, 0.04, 0));
  const pairs = R.map((r, i) => {
    const rin = CD / (1 + r);
    const rout = CD - rin;
    const gi = add(root, gearGeo(rin - 0.007, Math.max(12, Math.round(rin * 160)), 0.075, {hole: 0.03}), mat.gear, (o) => o.position.set(L.gx[i], L.inY, 0));
    const gm = glow('#a6adb4');
    gm.metalness = 0.85;
    gm.roughness = 0.4;
    const go = add(root, gearGeo(rout - 0.007, Math.max(12, Math.round(rout * 160)), 0.075, {hole: 0.045}), gm, (o) => o.position.set(L.gx[i], L.outY, 0));
    return {gi, go, gm, r};
  });
  // synchro sleeves on the output shaft, forks up to the rails
  const sleeves = [0, 1, 2].map((k) => {
    const x0 = (L.gx[2 * k] + L.gx[2 * k + 1]) / 2;
    const s = add(root, ring(0.05, 0.085, 0.06, 40), mat.dark, (o) => o.position.set(x0, L.outY, 0));
    const fork = new THREE.Group();
    root.add(fork);
    add(fork, new THREE.BoxGeometry(0.018, L.railY[k] - L.outY - 0.08, 0.03), mat.cast, (o) => o.position.set(0, (L.railY[k] + L.outY + 0.08) / 2, L.railZ));
    add(fork, new THREE.TorusGeometry(0.09, 0.012, 8, 24, Math.PI).rotateY(Math.PI / 2), mat.cast, (o) => o.position.set(0, L.outY, 0));
    return {s, fork, x0};
  });
  const rails = L.railY.map((y) => add(root, cylX(0.014, 1.35, 10), mat.shaft, (o) => o.position.set(0.15, y, L.railZ)));
  // rail heads where the finger engages
  const heads = L.railY.map((y) => add(root, new THREE.BoxGeometry(0.06, 0.045, 0.04), mat.dark, (o) => o.position.set(L.shaftX, y, L.railZ + 0.02)));
  // final drive: pinion on the output shaft, ring gear below behind
  const pinion = add(root, gearGeo(0.075, 13, 0.08, {hole: 0.03}), mat.gear, (o) => o.position.set(-0.54, L.outY, 0));
  const D = [L.outY - 0.25, -0.3];
  const ringG = add(root, gearGeo(0.32, 50, 0.07, {hole: 0.1}), mat.gear, (o) => o.position.set(-0.54, D[0], D[1]));
  add(root, cylX(0.09, 0.2, 20), mat.dark, (o) => o.position.set(-0.4, D[0], D[1]));

  // ------------------------------------------------------------ 1 · the clutch in the bell
  const clutch = new THREE.Group();
  root.add(clutch);
  // the flywheel's starter ring only, so the clutch cover reads from the engine side as in the drawing
  const flywheel = add(clutch, gearGeo(0.56, 110, 0.04, {hole: 0.5, bevel: 0.004}), mat.dark, (o) => (o.position.x = L.clutchX - 0.1));
  const disc = add(clutch, ring(0.1, 0.42, 0.022, 64), mat.friction, (o) => (o.position.x = L.clutchX - 0.035));
  const cover = new THREE.Group();
  clutch.add(cover);
  {
    // pressure-plate cover: a dished ring with windows, a diaphragm spring with fingers
    const cs = new THREE.Shape();
    cs.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
    const ch = new THREE.Path();
    ch.absarc(0, 0, 0.16, 0, Math.PI * 2, true);
    cs.holes.push(ch);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const w = new THREE.Path();
      w.absarc(0.34 * Math.cos(a), 0.34 * Math.sin(a), 0.055, 0, Math.PI * 2, true);
      cs.holes.push(w);
    }
    const cg = new THREE.ExtrudeGeometry(cs, {depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 32});
    cg.rotateY(Math.PI / 2);
    add(cover, cg, mat.darkCover, (o) => (o.position.x = L.clutchX - 0.005));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      add(cover, new THREE.BoxGeometry(0.008, 0.12, 0.026), mat.steel, (o) => {
        o.position.set(L.clutchX + 0.06, 0.11 * Math.cos(a), 0.11 * Math.sin(a));
        o.rotation.x = a;
      });
    }
  }
  const fingers = cover.children.slice(1);
  // ------------------------------------------------------------ 2 · concentric slave cylinder and its pipe
  const cscM = glow('#6c737b');
  const csc = add(root, ring(0.045, 0.12, 0.1, 40), cscM, (o) => (o.position.x = L.cscX));
  const cscBearing = add(root, ring(0.05, 0.1, 0.03, 40), mat.steel, (o) => (o.position.x = L.cscX - 0.07));
  add(root, new THREE.BoxGeometry(0.06, 0.08, 0.06), mat.cast, (o) => o.position.set(L.cscX, 0.15, 0.06));
  // pipe out through the bell wall, down to the clutch actuator
  const pipePts = [new V3(L.cscX, 0.18, 0.08), new V3(L.cscX - 0.03, 0.3, 0.3), new V3(-0.75, 0.25, 0.62), new V3(-0.7, -0.05, 0.66), new V3(-0.62, -0.25, 0.62), new V3(-0.5, -0.32, 0.6)];
  tube(root, pipePts, mat.brass, 0.012);
  add(root, new THREE.SphereGeometry(0.04, 16, 12), mat.steel, (o) => o.position.copy(pipePts[2]));

  // ------------------------------------------------------------ 3 + 4 · clutch actuator module with the TCU inside
  const CM = {x0: -0.5, x1: -0.02, y0: -0.98, y1: -0.25, z: 0.56, d: 0.2};
  const mod3 = new THREE.Group();
  root.add(mod3);
  {
    const w = CM.x1 - CM.x0;
    const h = CM.y1 - CM.y0;
    const cx = (CM.x0 + CM.x1) / 2;
    const cy = (CM.y0 + CM.y1) / 2;
    // housing open at the front, like the drawing's cut
    add(mod3, new THREE.BoxGeometry(w, h, 0.02), mat.blackIn, (o) => o.position.set(cx, cy, CM.z));
    add(mod3, new THREE.BoxGeometry(w, 0.025, CM.d), mat.black, (o) => o.position.set(cx, CM.y1, CM.z + CM.d / 2));
    add(mod3, new THREE.BoxGeometry(w, 0.025, CM.d), mat.black, (o) => o.position.set(cx, CM.y0, CM.z + CM.d / 2));
    add(mod3, new THREE.BoxGeometry(0.025, h, CM.d), mat.black, (o) => o.position.set(CM.x0, cy, CM.z + CM.d / 2));
    add(mod3, new THREE.BoxGeometry(0.025, h, CM.d), mat.black, (o) => o.position.set(CM.x1, cy, CM.z + CM.d / 2));
    // a cut front frame
    add(mod3, new THREE.BoxGeometry(w, 0.05, 0.02), mat.black, (o) => o.position.set(cx, CM.y1 - 0.025, CM.z + CM.d));
    add(mod3, new THREE.BoxGeometry(0.05, h * 0.55, 0.02), mat.black, (o) => o.position.set(CM.x1 - 0.025, CM.y1 - h * 0.28, CM.z + CM.d));
  }
  // motor with its copper winding, the worm, the worm wheel, the connecting rod and the piston with its spring
  const motor = new THREE.Group();
  motor.position.set(-0.4, -0.62, CM.z + 0.1);
  mod3.add(motor);
  add(motor, new THREE.CylinderGeometry(0.07, 0.07, 0.2, 28), mat.dark);
  const rotor = add(motor, new THREE.CylinderGeometry(0.05, 0.05, 0.2, 18), mat.copper, (o) => (o.position.z = 0.025));
  for (let i = 0; i < 6; i++) add(motor, new THREE.TorusGeometry(0.055, 0.008, 6, 20).rotateX(Math.PI / 2), mat.copper, (o) => (o.position.y = -0.08 + i * 0.03));
  const worm = new THREE.Group();
  worm.position.set(-0.4, -0.45, CM.z + 0.1);
  mod3.add(worm);
  {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 2 * 6;
      pts.push(new V3(0.03 * Math.cos(a), -0.08 + (i / 80) * 0.16, 0.03 * Math.sin(a)));
    }
    add(worm, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.008, 6), mat.steel);
    add(worm, new THREE.CylinderGeometry(0.02, 0.02, 0.2, 12), mat.steel);
  }
  const wheelM = glow('#cfd3d8');
  wheelM.metalness = 0.8;
  const wheel = add(mod3, gearGeo(0.13, 44, 0.05, {hole: 0.03}).rotateY(-Math.PI / 2), wheelM, (o) => o.position.set(-0.22, -0.45, CM.z + 0.1));
  const crankPin = new V3();
  const rod = add(mod3, new THREE.BoxGeometry(0.025, 1, 0.02), mat.steel);
  const PIST = {x: -0.18, yTop: -0.74, z: CM.z + 0.1};
  const pistonM = glow('#c9cdd2');
  const piston = add(mod3, new THREE.CylinderGeometry(0.035, 0.035, 0.1, 20), pistonM);
  add(mod3, new THREE.CylinderGeometry(0.05, 0.05, 0.2, 24, 1, true), new THREE.MeshStandardMaterial({color: '#7a8189', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.55}), (o) => o.position.set(PIST.x, -0.86, PIST.z));
  const spring = add(mod3, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({length: 61}, (_, i) => new V3(0.04 * Math.cos(i * 0.9), (i / 60) * 0.12, 0.04 * Math.sin(i * 0.9)))), 120, 0.006, 6), mat.steel);
  // the TCU board inside the module
  add(mod3, new THREE.BoxGeometry(0.18, 0.4, 0.012), mat.pcb, (o) => o.position.set(-0.1, -0.5, CM.z + 0.03));
  const tcuLeds = [];
  for (let i = 0; i < 5; i++) {
    add(mod3, new THREE.BoxGeometry(0.05, 0.03, 0.012), mat.black, (o) => o.position.set(-0.1, -0.36 - i * 0.065, CM.z + 0.042));
    const lm = new THREE.MeshStandardMaterial({color: '#2a2d31', emissive: ACC, emissiveIntensity: 0});
    add(mod3, new THREE.BoxGeometry(0.01, 0.01, 0.006), lm, (o) => o.position.set(-0.06, -0.36 - i * 0.065, CM.z + 0.05));
    tcuLeds.push(lm);
  }
  add(mod3, new THREE.BoxGeometry(0.1, 0.07, 0.08), mat.black, (o) => o.position.set(-0.1, CM.y1 + 0.05, CM.z + 0.08));

  // ------------------------------------------------------------ 5, 6, 7 · gear actuator on top, shift shaft into the case
  const GA = {x0: -0.12, x1: 0.42, y0: 0.32, y1: 0.66, z0: -0.18, z1: 0.24};
  const mod6 = new THREE.Group();
  root.add(mod6);
  {
    const w = GA.x1 - GA.x0;
    const cx = (GA.x0 + GA.x1) / 2;
    const cz = (GA.z0 + GA.z1) / 2;
    const h = GA.y1 - GA.y0;
    // housing open on the front face so the shaft and gearing read
    add(mod6, new THREE.BoxGeometry(w, 0.03, GA.z1 - GA.z0), mat.cast, (o) => o.position.set(cx, GA.y0, cz));
    add(mod6, new THREE.BoxGeometry(w, h, 0.03), mat.cast, (o) => o.position.set(cx, (GA.y0 + GA.y1) / 2, GA.z0));
    add(mod6, new THREE.BoxGeometry(0.03, h, GA.z1 - GA.z0), mat.cast, (o) => o.position.set(GA.x0, (GA.y0 + GA.y1) / 2, cz));
    add(mod6, new THREE.BoxGeometry(0.03, h, GA.z1 - GA.z0), mat.cast, (o) => o.position.set(GA.x1, (GA.y0 + GA.y1) / 2, cz));
    add(mod6, new THREE.BoxGeometry(w * 0.55, 0.03, (GA.z1 - GA.z0) * 0.6), mat.cast, (o) => o.position.set(GA.x0 + w * 0.27, GA.y1, GA.z0 + 0.12));
    for (const [x, z] of [[GA.x0 + 0.03, GA.z1 - 0.03], [GA.x1 - 0.03, GA.z1 - 0.03], [GA.x0 + 0.03, GA.z0 + 0.03], [GA.x1 - 0.03, GA.z0 + 0.03]])
      add(mod6, new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6), mat.steel, (o) => o.position.set(x, GA.y0 + 0.03, z));
  }
  // 6 · engage motor (behind, along x) turning a crown gear on the shift shaft
  const engM = glow('#cfd3d8');
  engM.metalness = 0.6;
  const engMotor = new THREE.Group();
  engMotor.position.set(0.5, 0.52, -0.02);
  mod6.add(engMotor);
  add(engMotor, cylX(0.075, 0.3, 28), engM, (o) => (o.position.x = 0.1));
  add(engMotor, cylX(0.08, 0.03, 28), mat.dark, (o) => (o.position.x = -0.05));
  add(engMotor, new THREE.BoxGeometry(0.1, 0.07, 0.1), mat.black, (o) => o.position.set(0.18, 0.09, 0));
  const engPinion = add(mod6, gearGeo(0.035, 9, 0.05, {hole: 0.01}), mat.steel, (o) => o.position.set(0.3, 0.52, L.shaftZ - 0.02));
  const crown = add(mod6, gearGeo(0.11, 34, 0.035, {hole: 0.02}).rotateZ(Math.PI / 2), mat.steel, (o) => o.position.set(L.shaftX, 0.47, L.shaftZ));
  // 7 · select motor on the front corner, a rack on the shaft moves it up and down
  const selM = glow('#cfd3d8');
  selM.metalness = 0.6;
  const selMotor = new THREE.Group();
  selMotor.position.set(-0.05, 0.75, 0.15);
  mod6.add(selMotor);
  add(selMotor, new THREE.CylinderGeometry(0.065, 0.065, 0.24, 28), selM);
  add(selMotor, new THREE.BoxGeometry(0.09, 0.06, 0.09), mat.black, (o) => (o.position.y = 0.15));
  const selPinion = add(mod6, gearGeo(0.04, 10, 0.04, {hole: 0.01}).rotateZ(Math.PI / 2), mat.steel, (o) => o.position.set(L.shaftX - 0.07, 0.6, L.shaftZ));
  // 5 · the shift shaft with its rack and the finger at the bottom
  const shaft5 = new THREE.Group();
  root.add(shaft5);
  add(shaft5, new THREE.CylinderGeometry(0.025, 0.025, 1.0, 20), mat.shaft, (o) => (o.position.y = 0.3));
  const rack = add(shaft5, new THREE.BoxGeometry(0.03, 0.18, 0.035), mat.dark, (o) => o.position.set(-0.03, 0.62, 0));
  void rack;
  const fingerM = glow('#d0d4d9');
  const finger = add(shaft5, new THREE.BoxGeometry(0.03, 0.04, 0.13), fingerM, (o) => o.position.set(0, -0.2, -0.06));

  // ------------------------------------------------------------ harness and sensors
  tube(root, [new V3(0.68, 0.61, -0.02), new V3(0.7, 0.85, 0.1), new V3(0.3, 0.95, 0.3), new V3(-0.2, 0.9, 0.5), new V3(-0.55, 0.4, 0.75), new V3(-0.25, -0.18, 0.7)], mat.loom, 0.014);
  tube(root, [new V3(-0.05, 0.9, 0.15), new V3(-0.1, 1.05, 0.25), new V3(-0.35, 0.85, 0.6), new V3(-0.3, -0.1, 0.78), new V3(-0.1, -0.2, 0.74)], mat.loom, 0.012);
  tube(root, [new V3(-0.05, -0.2, 0.72), new V3(0.2, -0.2, 0.8), new V3(0.6, -0.5, 0.9), new V3(1.2, -0.8, 1.0)], mat.loom, 0.014);
  add(root, new THREE.BoxGeometry(0.1, 0.06, 0.06), mat.plastic, (o) => o.position.set(1.2, -0.8, 1.0));
  // input speed sensor, reading the 4th-gear wheel through the case top
  add(root, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 14), mat.black, (o) => o.position.set(L.gx[3], 0.32, -0.12));
  tube(root, [new V3(L.gx[3], 0.42, -0.12), new V3(L.gx[3] - 0.1, 0.6, -0.25), new V3(0.0, 0.85, -0.1), new V3(-0.05, 0.9, 0.15)], mat.loom, 0.01);

  // ------------------------------------------------------------ pose
  const fdA = SPEC.AMT.fd;
  const ax = new V3(1, 0, 0);
  void ax;
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
  /** s: model state; cam radians; o: {caseK} */
  const frame = (s, cam, o, T) => {
    const open = 1 - s.a1;
    // 1 · clutch: the cover and fingers back off as the CSC pushes
    flywheel.rotation.x = s.angEng;
    cover.rotation.x = s.angEng;
    cover.position.x = 0.03 * open;
    disc.rotation.x = s.angIn;
    for (const f of fingers) f.rotation.z = 0;
    // 2 · CSC piston travels toward the engine
    csc.position.x = L.cscX - 0.02 * open;
    cscBearing.position.x = L.cscX - 0.07 - 0.04 * open;
    cscM.emissiveIntensity = 0.85 * open;
    // 3 · the motor turns the worm, the worm turns the wheel, the crank on the wheel drives the rod and the piston (4)
    const wa = 1.7 * open;
    wheel.rotation.z = wa;
    wheelM.emissiveIntensity = 0.6 * open;
    rotor.rotation.y = wa * 28;
    worm.rotation.y = wa * 28;
    crankPin.set(-0.22 + 0.08 * Math.sin(wa + 0.3), -0.45 - 0.08 * Math.cos(wa + 0.3), CM.z + 0.13);
    const py = PIST.yTop - 0.05 * open;
    piston.position.set(PIST.x, py, PIST.z);
    pistonM.emissiveIntensity = 0.7 * open;
    const top = new V3(PIST.x, py + 0.05, PIST.z + 0.03);
    const mid = crankPin.clone().add(top).multiplyScalar(0.5);
    rod.position.copy(mid);
    rod.scale.y = crankPin.distanceTo(top);
    rod.rotation.z = Math.atan2(top.x - crankPin.x, crankPin.y - top.y);
    spring.position.set(PIST.x, -0.98, PIST.z);
    spring.scale.y = (py - 0.05 + 0.98) / 0.12;
    tcuLeds.forEach((m, i) => (m.emissiveIntensity = i === 0 ? 1 + 0.5 * Math.sin(T * 30) : i === 1 ? 1.6 * open : i === 2 ? (s.ph >= 0.34 && s.ph < 0.46 ? 1.6 : 0) : i === 3 ? (s.ph >= 0.2 && s.ph < 0.62 && !(s.ph >= 0.34 && s.ph < 0.46) ? 1.6 : 0) : 0.4));
    // 5 · shaft: select moves it up and down to a rail, engage turns it so the finger pushes that rail
    const gate = s.a3;
    const yRail = L.railY[0] + (L.railY[1] - L.railY[0]) * gate;
    const lift = yRail - L.railY[0];
    const turn = -s.a2 * 0.45;
    shaft5.position.set(L.shaftX, lift, L.shaftZ);
    shaft5.rotation.y = turn;
    shaft5.children[0].position.y = 0.3 - lift * 0; // shaft runs through
    finger.position.y = L.railY[0] - 0.0;
    const selecting = s.ph >= 0.34 && s.ph < 0.46;
    const engaging = s.ph >= 0.2 && s.ph < 0.62 && !selecting;
    fingerM.emissiveIntensity = engaging || selecting ? 0.7 : 0;
    crown.rotation.y = turn;
    engPinion.rotation.x = -turn * 3.2;
    selPinion.rotation.y = lift * 25;
    engM.emissiveIntensity = engaging ? 0.55 : 0;
    selM.emissiveIntensity = selecting ? 0.55 : 0;
    // rails and sleeves: the selected rail travels with the finger; +throw = toward the odd gear (lower x)
    sleeves.forEach((q, k) => {
      const w = Math.max(0, 1 - Math.abs(gate - k) * 2);
      const off = -s.a2 * 0.085 * w;
      q.s.position.x = q.x0 + off;
      q.fork.position.x = q.x0 + off;
      rails[k].position.x = 0.15 + off;
      heads[k].position.x = L.shaftX + off;
      q.s.rotation.x = -s.angOut * fdA;
    });
    inShaft.rotation.x = s.angIn;
    outShaft.rotation.x = -s.angOut * fdA;
    pinion.rotation.x = -s.angOut * fdA;
    ringG.rotation.x = s.angOut;
    pairs.forEach((p, i) => {
      p.gi.rotation.x = s.angIn;
      p.go.rotation.x = -s.angIn / p.r;
      p.gm.emissiveIntensity = s.sel === i + 1 ? 0.5 * s.a1 : 0;
    });
    // case
    castCut.opacity = o.caseK;
    castCut.transparent = o.caseK < 0.999;
    mat.cast.opacity = o.caseK;
    mat.cast.transparent = o.caseK < 0.999;
    mat.cutFace.visible = o.caseK > 0.02;
    caseGroup.visible = o.caseK > 0.02;
    mat.darkCover.opacity = o.caseK;
    mat.darkCover.transparent = o.caseK < 0.999;

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
  // numbered parts, as in the drawing
  const parts = [
    [1, 'Self-adjusting clutch', 'disc · pressure plate · diaphragm', new V3(L.clutchX + 0.02, 0.42, 0.25)],
    [2, 'Concentric slave cylinder', 'and its pipe from the actuator', new V3(-0.75, 0.25, 0.62)],
    [3, 'Clutch actuator with TCU', 'motor · worm · worm wheel', new V3(-0.22, -0.45, CM.z + 0.14)],
    [4, 'Master-cylinder piston', 'builds the clutch pressure', new V3(PIST.x, -0.86, PIST.z + 0.05)],
    [5, 'Shift shaft and finger', 'moves the selected rail', new V3(L.shaftX, 0.1, L.shaftZ + 0.03)],
    [6, 'Engage motor', 'turns the shaft: in or out of gear', new V3(0.6, 0.6, 0.02)],
    [7, 'Select motor', 'lifts the shaft to a gate', new V3(-0.05, 0.85, 0.15)],
  ];
  return {renderer, scene, camera, composer, resize, frame, project, parts, setQuality};
}
