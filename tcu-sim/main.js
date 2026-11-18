// The TCU as a page you drive. The drive cycle plays the model's state over time; the timeline scrubs it; the pedal
// and brake sliders hand the input to the visitor and run the same step() live. Four views, four layers, orbit and
// zoom. Left alone it plays an auto tour with a cursor; a click, drag, wheel or key takes over, 25 s of quiet hands
// it back.
import {warmComposer} from 'teardown-kit/warm.js';
import {CYCLE, initState, phaseAt, step, tabulate} from './model.js';
import {buildScene} from './scene.js';
import {createConsole, LAYERS, VIEWS} from './ui.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ss = (a, b, t) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// camera presets: target, azimuth, elevation (deg), distance; sx/sy shift the frame clear of the panels
const VIEW = {
  hero: {tx: 0.05, ty: -0.3, tz: 0.25, az: 34, el: 21, d: 6.4, sx: -10, sy: 10},
  gearbox: {tx: 0.1, ty: -0.12, tz: 0, az: 4, el: 8, d: 5.3, sx: 0, sy: 0},
  tcu: {tx: 0.1, ty: -0.86, tz: 0.9, az: 16, el: 58, d: 3.4, sx: 0, sy: 20},
  valves: {tx: 0.05, ty: -0.38, tz: 0.45, az: -24, el: 22, d: 5.4, sx: 0, sy: 0},
};

// the tour: what the operator presses, on the drive cycle's clock
const SCRIPT = [
  [3.0, 'gearbox'],
  [11.5, 'hero'],
  [15.0, 'open'],
  [15.6, 'tcu'],
  [22.6, 'hero'],
  [30.5, 'valves'],
  [38.5, 'open'],
  [39.2, 'gearbox'],
  [49.5, 'hero'],
];

const CSS = `
html,body{background:#eceef0;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.tourchip{position:absolute;left:800px;top:30px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:22px;padding:0 11px;border:1px solid #e1e3e6;border-radius:4px;background:rgba(248,248,249,.95);color:#16181b;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#d6182b}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
`;

const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);
const app = document.getElementById('app');
const canvas = document.createElement('canvas');
canvas.id = 'gl';
app.appendChild(canvas);
const tab = tabulate();
const st = buildScene(canvas);
const ui = createConsole(app, tab.shifts);
const q = new URLSearchParams(location.search);

// ------------------------------------------------------------ quality tiers
const TIERS = [
  {samples: 4, shadow: 2048, pr: 2},
  {samples: 2, shadow: 1024, pr: 1.25},
  {samples: 0, shadow: 512, pr: 1},
];
let tier = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700 ? 1 : 0;
let scale = 1;
const fit = () => {
  scale = Math.min(innerWidth / W, innerHeight / H);
  app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
  st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
};
const applyTier = () => {
  const {pr, ...qq} = TIERS[tier];
  void pr;
  st.setQuality(qq);
  fit();
};
applyTier();
addEventListener('resize', fit);
const toStage = (cx, cy) => {
  const r = app.getBoundingClientRect();
  return [(cx - r.left) / scale, (cy - r.top) / scale];
};
const tourChip = document.createElement('div');
tourChip.className = 'tourchip';
ui.root.appendChild(tourChip);

// ------------------------------------------------------------ state
let T = 0;
let mode = 'cycle';
let tc = 0;
let paused = false;
let view = 'hero';
let live = initState();
let lp = 0; // live pedal and brake
let lb = 0;
const layer = Object.fromEntries(LAYERS.map((k) => [k, {on: k !== 'open' ? 1 : 0, t: -9}]));
const off = {az: 0, el: 0, k: 1};
const cam = {...VIEW.hero};
let ring = {t: -9, x: 0, y: 0};
const eased = (k, dur = 0.7) => {
  const d = layer[k];
  const x = ss(d.t, d.t + dur, T);
  return d.on ? x : 1 - x;
};
const setLayer = (k, v) => {
  if (layer[k].on !== v) layer[k] = {on: v, t: T};
};
const pulse = (k) => {
  const [x, y] = ui.spot(k);
  ring = {t: T, x, y};
};

// pressure history: from the table in the cycle, from a ring buffer when driving
const HN = 160;
const HDT = 10 / (HN - 1);
const buf = Array.from({length: 5}, () => new Float32Array(HN));
let bufT = 0;
const hist = {
  n: HN,
  get: (i, j) => (mode === 'cycle' ? tab.pressure(i, tc - 10 + j * HDT) : buf[i][j]),
};
const pushHist = (s, dt) => {
  bufT += dt;
  while (bufT >= HDT) {
    bufT -= HDT;
    for (let i = 0; i < 5; i++) {
      buf[i].copyWithin(0, 1);
      buf[i][HN - 1] = s.P[i];
    }
  }
};
const seedHist = () => {
  for (let i = 0; i < 5; i++) for (let j = 0; j < HN; j++) buf[i][j] = tab.pressure(i, tc - 10 + j * HDT);
};

const toDrive = () => {
  if (mode === 'drive') return;
  const s = tab.sample(tc);
  live = {...initState(), ...s, P: [...s.P], lastShift: s.t - 1, t: s.t};
  lp = s.pedal;
  lb = s.brake;
  seedHist();
  mode = 'drive';
  paused = false;
};
const toCycle = () => {
  mode = 'cycle';
  paused = false;
};

// ------------------------------------------------------------ the tour
const AP = {on: !q.has('notour'), t0: 0};
let lastInput = 0;
let viewSince = 0;
const startTour = () => {
  AP.on = true;
  AP.t0 = T;
  mode = 'cycle';
  tc = 0;
  paused = false;
  view = 'hero';
  viewSince = T;
  for (const k of LAYERS) setLayer(k, k !== 'open' ? 1 : 0);
  Object.assign(off, {az: 0, el: 0, k: 1});
};
const takeOver = () => {
  lastInput = T;
  AP.on = false;
};
tourChip.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  lastInput = T;
  if (AP.on) takeOver();
  else startTour();
});
addEventListener('pointerdown', (e) => {
  if (e.target !== tourChip) takeOver();
});
// the cursor: glide to the next button 0.9 s before pressing it
const tourCursor = (c) => {
  let prev = [800, 520];
  for (let i = 0; i < SCRIPT.length; i++) {
    const [t, k] = SCRIPT[i];
    const p = ui.spot(k);
    if (c < t - 0.9) return {x: prev[0], y: prev[1], press: false, ring: 0, ringX: 0, ringY: 0};
    if (c < t) {
      const u = ss(t - 0.9, t - 0.05, c);
      return {x: prev[0] + (p[0] - prev[0]) * u, y: prev[1] + (p[1] - prev[1]) * u, press: c > t - 0.12, ring: 0, ringX: 0, ringY: 0};
    }
    if (c < t + 0.55) return {x: p[0], y: p[1], press: false, ring: 1 - (c - t) / 0.55, ringX: p[0], ringY: p[1]};
    prev = p;
  }
  return {x: prev[0], y: prev[1], press: false, ring: 0, ringX: 0, ringY: 0};
};
let lastScript = -1;
const runScript = (c) => {
  let idx = -1;
  for (let i = 0; i < SCRIPT.length; i++) if (c >= SCRIPT[i][0]) idx = i;
  if (idx === lastScript) return;
  if (idx < lastScript) lastScript = -1;
  for (let i = lastScript + 1; i <= idx; i++) {
    const k = SCRIPT[i][1];
    if (VIEWS.includes(k)) {
      view = k;
      viewSince = T;
    } else setLayer(k, layer[k].on ? 0 : 1);
  }
  lastScript = idx;
};

// ------------------------------------------------------------ controls
for (const v of VIEWS)
  ui.btn[v].addEventListener('click', () => {
    takeOver();
    pulse(v);
    view = v;
    viewSince = T;
    Object.assign(off, {az: 0, el: 0, k: 1});
  });
for (const k of LAYERS)
  ui.btn[k].addEventListener('click', () => {
    takeOver();
    pulse(k);
    setLayer(k, layer[k].on ? 0 : 1);
  });
ui.btn.play.addEventListener('click', () => {
  takeOver();
  pulse('play');
  if (mode === 'cycle' && tc >= CYCLE.dur - 0.01) tc = 0;
  paused = !paused;
});
ui.btn.cycle.addEventListener('click', () => {
  takeOver();
  pulse('cycle');
  toCycle();
});
ui.btn.restart.addEventListener('click', () => {
  takeOver();
  pulse('restart');
  mode = 'cycle';
  tc = 0;
  paused = false;
});
const slider = (x0, w, y, apply) => {
  const d = document.createElement('div');
  d.className = 'hit';
  Object.assign(d.style, {left: `${x0 - 8}px`, top: `${y - 11}px`, width: `${w + 16}px`, height: '22px'});
  const move = (e) => {
    const [x] = toStage(e.clientX, e.clientY);
    apply(clamp((x - x0) / w, 0, 1));
    lastInput = T;
  };
  d.addEventListener('pointerdown', (e) => {
    takeOver();
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    move(e);
  });
  ui.root.appendChild(d);
};
slider(ui.TL.x, ui.TL.w, ui.TL.y, (k) => {
  mode = 'cycle';
  tc = k * CYCLE.dur;
  paused = true;
});
slider(ui.PD.x, ui.PD.w, ui.pedY, (k) => {
  toDrive();
  lp = k;
  if (k > 0.02) lb = 0;
});
slider(ui.PD.x, ui.PD.w, ui.brkY, (k) => {
  toDrive();
  lb = k;
  if (k > 0.02) lp = 0;
});
addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const v = {1: 'hero', 2: 'gearbox', 3: 'tcu', 4: 'valves'}[e.key];
  if (v) ui.btn[v].click();
  else if (e.key === ' ') ui.btn.play.click();
  else if (e.key === 'o') ui.btn.open.click();
  else return;
  e.preventDefault();
});
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = {x: e.clientX, y: e.clientY};
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  off.az -= ((e.clientX - drag.x) / scale) * 0.3;
  off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -30, 60);
  drag = {x: e.clientX, y: e.clientY};
  lastInput = T;
});
const endDrag = () => {
  drag = null;
  canvas.classList.remove('drag');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    takeOver();
    off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.4, 2.2);
  },
  {passive: false},
);

// test hooks: ?t=12&view=gearbox&open=1&notour
if (q.has('t')) {
  tc = Number(q.get('t'));
  paused = true;
}
if (q.get('view')) view = q.get('view');
if (q.has('t')) viewSince = -9;
if (q.get('open') === '1') layer.open = {on: 1, t: -9};
if (q.get('housing') === '0') layer.housing = {on: 0, t: -9};

// ------------------------------------------------------------ the frame
if (AP.on) startTour();
else Object.assign(cam, VIEW[view]);
let last = performance.now();
const perf = {n: 0, sum: 0, slow: 0, age: 0};
const frame = (now) => {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  T += dt;
  if (tier < TIERS.length - 1) {
    perf.age += dt;
    if (perf.age > 0.6) {
      perf.sum += dt;
      perf.n++;
      if (perf.sum >= 0.5 && perf.n >= 6) {
        perf.slow = perf.sum / perf.n > 0.024 ? perf.slow + 1 : 0;
        perf.sum = 0;
        perf.n = 0;
        if (perf.slow >= 2) {
          tier++;
          applyTier();
          Object.assign(perf, {age: 0, slow: 0});
        }
      }
    }
  }

  let cursor = {x: -99, y: -99, press: false, ring: 0, ringX: 0, ringY: 0};
  if (AP.on) {
    const c = T - AP.t0;
    if (c >= CYCLE.dur + 1.5) startTour();
    tc = Math.min(CYCLE.dur, T - AP.t0);
    runScript(tc);
    cursor = tourCursor(tc);
  } else {
    if (T - lastInput > IDLE && !q.has('notour')) startTour();
    if (mode === 'cycle' && !paused) {
      tc += dt;
      if (tc >= CYCLE.dur) {
        tc = CYCLE.dur;
        paused = true;
      }
    }
    const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
    cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
  }
  let s;
  if (mode === 'cycle') s = tab.sample(tc);
  else {
    if (!paused) {
      const n = Math.max(1, Math.round(dt * 200));
      for (let i = 0; i < n; i++) step(live, lp, lb, dt / n);
      pushHist(live, dt);
    }
    s = live;
  }

  const tgt = {...VIEW[view]};
  tgt.az += off.az;
  tgt.el = clamp(tgt.el + off.el, -20, 85);
  tgt.d *= off.k;
  const k = 1 - Math.exp(-dt / (AP.on ? 0.35 : 0.3));
  cam.az += wrap(tgt.az - cam.az) * k;
  for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
  const explode = eased('open', 0.9);
  st.frame({...s, T}, {...cam, az: cam.az * D2R, el: cam.el * D2R}, {housing: eased('housing'), explode, signals: eased('signals', 0.4)});
  ui.update(s, {
    hist,
    tc,
    mode,
    paused: AP.on ? false : paused,
    phase: phaseAt(tc),
    view,
    layers: Object.fromEntries(LAYERS.map((x) => [x, layer[x].on])),
    labels: eased('labels', 0.5) * ss(0.6, 1.2, T - viewSince),
    explode,
    project: st.project,
    anchors: st.anchors,
    cursor,
  });
  if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
    tourChip.classList.toggle('on', AP.on);
    tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
  }
  requestAnimationFrame(frame);
};
warmComposer(st.renderer, st.composer, st.scene, st.camera)
  .catch(() => {})
  .then(() => requestAnimationFrame(frame));
window.LIVE = {st, cam, get T() {
  return T;
}};
