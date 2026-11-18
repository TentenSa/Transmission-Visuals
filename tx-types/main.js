// Four ways to change ratio: the same launch through an AT, a CVT, an AMT and a DCT. Pick a type, scrub the launch,
// compare the push at the wheels and the engine speed of all four. Left alone it tours each type in turn.
import {warmComposer} from 'teardown-kit/warm.js';
import {DUR, NAME, SPEC, TYPES, tabulateAll} from './model.js';
import {buildScene} from './scene.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const C = {ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6', panel: 'rgba(248,248,249,.94)', red: '#d6182b', soft: '#eef0f2'};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ss = (a, b, t) => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});

const VIEWS = ['hero', 'side', 'front'];
const VIEW = {
  hero: {tx: -0.2, ty: -0.3, tz: 0.2, az: 30, el: 20, d: 7.2},
  side: {tx: -0.3, ty: -0.25, tz: 0, az: 78, el: 12, d: 6.2},
  front: {tx: -0.3, ty: -0.25, tz: 0.2, az: 2, el: 10, d: 6.8},
};

// what the TCU senses, drives, and where it earns its keep, per type (general engineering knowledge)
const JOB = {
  AT: {
    senses: 'Turbine and output speed, oil temperature; pedal and engine torque over CAN.',
    drives: 'One pressure solenoid per clutch or brake, plus the converter lock-up.',
    hard: 'Timing the handover: the oncoming clutch must take the load just as the offgoing one lets go. Too early ties the box up, too late lets the engine flare.',
    bars: [['Offgoing element', (s) => (s.ph >= 0 ? s.a1 : 0)], ['Oncoming element', (s) => (s.ph >= 0 ? s.a2 : 0)], ['Converter lock-up', (s) => s.a3]],
  },
  CVT: {
    senses: 'Primary and secondary pulley speeds, oil pressure and temperature; pedal over CAN.',
    drives: 'A ratio valve that moves the primary sheave, a clamping valve on the secondary, the lock-up.',
    hard: 'Clamping force. Too little and the belt slips and wears; too much and every extra bar costs fuel. Meanwhile the engine is held at one speed.',
    bars: [['Ratio (low → high)', (s) => 1 - s.a1], ['Belt clamping', (s) => s.a2], ['Converter lock-up', (s) => s.a3]],
  },
  AMT: {
    senses: 'Input and output speed, clutch and selector positions; pedal and engine torque over CAN.',
    drives: 'A clutch actuator and a shift actuator that selects the gate and engages the gear.',
    hard: 'The torque gap. While the clutch is open the car coasts; the TCU keeps the gap short and closes the clutch without a jolt.',
    bars: [['Clutch closed', (s) => s.a1], ['Selector in neutral', (s) => s.a2]],
  },
  DCT: {
    senses: 'Both input-shaft speeds, output speed, clutch positions or pressures; pedal and engine torque over CAN.',
    drives: 'Two clutches and two shift actuators: the next gear waits pre-selected on the idle shaft.',
    hard: 'The crossover: one clutch hands the torque to the other with no gap. And guessing the next gear, since pre-selecting the wrong one costs a shift.',
    bars: [['Clutch 1 · odd gears', (s) => s.a1], ['Clutch 2 · even gears', (s) => s.a2]],
  },
};
const TABLE = [
  ['', 'Ratios', 'Shift', 'Push', 'Launch'],
  ['AT', '6–10', '0.3–0.6 s', 'dips', 'converter'],
  ['CVT', 'stepless', 'none', 'smooth', 'converter'],
  ['AMT', '5–16', '0.6–1.2 s', 'gap', 'clutch'],
  ['DCT', '6–8', '0.2–0.4 s', 'small dip', 'clutch'],
];
const TAB = {AT: 'Planetary sets', CVT: 'Belt and pulleys', AMT: 'Automated manual', DCT: 'Dual clutch'};

const CSS = `
html,body{background:#eceef0;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.ab{position:absolute}
.tb{position:absolute;height:21px;padding:0 8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap;pointer-events:auto;cursor:pointer;user-select:none}
.tb.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.tab{position:absolute;height:52px;width:150px;border:1px solid ${C.line};background:#fff;pointer-events:auto;cursor:pointer;user-select:none;padding:8px 12px}
.tab b{display:block;font-size:19px;font-weight:800;letter-spacing:-.4px}
.tab span{display:block;font-size:8.6px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${C.mute};margin-top:2px}
.tab.on{border-color:${C.red};box-shadow:inset 0 -3px 0 ${C.red}}
.tab.on b{color:${C.red}}
.txt{font-size:10.8px;line-height:1.45}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:11.5px;font-weight:600}
.call span{display:block;font-size:8.4px;font-weight:600;letter-spacing:1.3px;color:${C.mute};text-transform:uppercase;margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.red};opacity:0;z-index:49}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:30px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:22px;padding:0 11px;border:1px solid ${C.line};border-radius:4px;background:rgba(248,248,249,.95);color:${C.ink};font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:${C.red}}
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
const sims = tabulateAll();
const st = buildScene(canvas);
const q = new URLSearchParams(location.search);

const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const ui = el(`<div class="ui"></div>`);
app.appendChild(ui);
const add = (h) => {
  const n = el(h);
  ui.appendChild(n);
  return n;
};
const svg = add(`<svg class="ab" style="left:0;top:0;width:1600px;height:900px;overflow:visible" viewBox="0 0 1600 900"></svg>`);

// ------------------------------------------------------------ title and the active type
add(`<div class="ab" style="left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
add(`<div class="ab" style="left:35px;top:47px;font-size:24px;font-weight:700;letter-spacing:-.2px">Four ways <span style="color:${C.red}">·</span> to change ratio</div>`);
add(`<div class="cp ab" style="left:35px;top:81px;font-weight:500;letter-spacing:1.7px;font-size:9.4px">SAME CAR &nbsp;•&nbsp; SAME PEDAL &nbsp;•&nbsp; SAME ${DUR} S LAUNCH &nbsp;•&nbsp; WHAT THE TCU CONTROLS IN EACH</div>`);
const typeBig = add(`<div class="ab" style="left:33px;top:102px;font-size:58px;font-weight:800;letter-spacing:-2px;color:${C.red};line-height:1"></div>`);
const typeName = add(`<div class="ab" style="left:200px;top:110px;font-size:13px;font-weight:700"></div>`);
const typeNow = add(`<div class="ab" style="left:200px;top:128px;font-size:11px;color:${C.mute}"></div>`);
const stateTx = add(`<div class="ab" style="left:35px;top:172px;width:300px;font-size:12.5px;font-weight:600"></div>`);

// ------------------------------------------------------------ the TCU's job (left)
add(`<div class="pn" style="left:35px;top:208px;width:278px;height:430px"></div>`);
add(`<div class="cp ab" style="left:47px;top:220px;font-weight:700">THE TCU'S JOB HERE</div>`);
const jobSec = {};
[['senses', 'SENSES', 242], ['drives', 'DRIVES', 314], ['hard', 'THE HARD PART', 386]].forEach(([k, l, y]) => {
  add(`<div class="cp ab" style="left:47px;top:${y}px;font-size:8.6px;color:${k === 'hard' ? C.red : C.mute}">${l}</div>`);
  jobSec[k] = add(`<div class="ab txt" style="left:47px;top:${y + 15}px;width:252px"></div>`);
});
add(`<div class="cp ab mu" style="left:47px;top:500px;font-size:8.6px">ACTUATORS · LIVE</div>`);
const bars = [0, 1, 2].map((i) => {
  const y = 520 + i * 38;
  return {
    l: add(`<div class="ab" style="left:47px;top:${y}px;font-size:11px;font-weight:500"></div>`),
    v: add(`<div class="ab" style="left:250px;top:${y - 1}px;width:50px;text-align:right;font-size:13px;font-weight:700"></div>`),
    bk: add(`<div class="ab" style="left:47px;top:${y + 19}px;width:253px;height:4px;background:#e6e7e9"></div>`),
    f: add(`<div class="ab" style="left:47px;top:${y + 19}px;height:4px;background:${C.ink}"></div>`),
  };
});

// ------------------------------------------------------------ charts and table (right)
add(`<div class="pn" style="left:1290px;top:36px;width:277px;height:392px"></div>`);
const chart = (y, title, unit) => {
  add(`<div class="cp ab" style="left:1302px;top:${y}px;font-weight:700">${title}</div>`);
  add(`<div class="cp ab mu" style="left:1500px;top:${y}px;width:55px;text-align:right;font-weight:500">${unit}</div>`);
  const c = add(`<canvas class="ab" width="506" height="300" style="left:1302px;top:${y + 18}px;width:253px;height:150px"></canvas>`);
  const x = c.getContext('2d');
  x.scale(2, 2);
  return x;
};
const fctx = chart(48, 'Push at the wheels', 'kN');
const rctx = chart(238, 'Engine speed', 'rpm');
const N = 400;
const SER = Object.fromEntries(TYPES.map((t) => [t, {f: sims[t].series('force', N), e: sims[t].series('eng', N)}]));
const drawChart = (c, key, max, ticks, active, t) => {
  c.clearRect(0, 0, 253, 150);
  const X = (u) => 24 + u * 200;
  const Y = (v) => 128 - (v / max) * 118;
  c.font = '600 7.5px Inter';
  c.strokeStyle = C.line;
  c.lineWidth = 1;
  c.fillStyle = C.mute;
  for (const v of ticks) {
    c.beginPath();
    c.moveTo(24, Y(v));
    c.lineTo(224, Y(v));
    c.stroke();
    c.fillText(key === 'f' ? `${v / 1000}` : `${v / 1000}k`, 2, Y(v) + 3);
  }
  for (let s = 0; s <= DUR; s += 2) c.fillText(`${s}`, X(s / DUR) - 3, 142);
  c.fillText('S', 236, 142);
  for (const ty of [...TYPES.filter((x) => x !== active), active]) {
    const a = ty === active;
    const d = SER[ty][key];
    c.strokeStyle = a ? C.red : 'rgba(22,24,27,.22)';
    c.lineWidth = a ? 1.8 : 1;
    c.beginPath();
    for (let j = 0; j < N; j++) {
      const x = X(j / (N - 1));
      const y = Y(d[j]);
      if (j) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
    if (a) {
      c.fillStyle = C.red;
      c.font = '700 7.5px Inter';
      c.fillText(ty, 228, Y(d[N - 1]) + 3);
    }
  }
  c.strokeStyle = C.ink;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(X(t / DUR), 8);
  c.lineTo(X(t / DUR), 128);
  c.stroke();
};
add(`<div class="pn" style="left:1290px;top:440px;width:277px;height:150px"></div>`);
const rowsT = TABLE.map((r, i) => {
  const y = 450 + i * 26;
  const bg = add(`<div class="ab" style="left:1291px;top:${y - 4}px;width:275px;height:24px"></div>`);
  const cols = [1302, 1340, 1398, 1460, 1510];
  r.forEach((txt, j) => add(`<div class="ab ${i === 0 ? 'cp mu' : ''}" style="left:${cols[j]}px;top:${y + (i === 0 ? 3 : 2)}px;font-size:${i === 0 ? 7.4 : j === 0 ? 10.5 : 9.4}px;font-weight:${j === 0 || i === 0 ? 700 : 500};letter-spacing:${i === 0 ? 1 : 0}px">${txt}</div>`));
  return bg;
});
add(`<div class="ab" style="left:1302px;top:596px;width:255px;font-size:8.6px;color:${C.mute};line-height:1.35">Typical ranges for road cars; numbers on this page are a generic model, not any product's calibration.</div>`);

// ------------------------------------------------------------ type tabs, timeline (bottom centre)
const tabs = {};
TYPES.forEach((ty, i) => {
  tabs[ty] = add(`<div class="tab" style="left:${485 + i * 160}px;top:738px"><b>${ty}</b><span>${TAB[ty]}</span></div>`);
});
const TL = {x: 485, w: 630, y: 822};
add(`<div class="ab" style="left:${TL.x}px;top:${TL.y}px;width:${TL.w}px;height:2px;background:${C.faint}"></div>`);
const tlFill = add(`<div class="ab" style="left:${TL.x}px;top:${TL.y}px;height:2px;background:${C.ink}"></div>`);
const tlKnob = add(`<div class="ab" style="top:${TL.y - 5}px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:${C.red};border:2px solid #fff;box-shadow:0 0 0 1px ${C.red}"></div>`);
const tlTicks = add(`<div class="ab" style="left:0;top:0"></div>`);
const tlTime = add(`<div class="cp ab" style="left:${TL.x}px;top:${TL.y + 12}px;font-weight:600"></div>`);
add(`<div class="cp ab mu" style="left:${TL.x + TL.w - 260}px;top:${TL.y + 12}px;width:260px;text-align:right;font-weight:500;font-size:8.4px">TICKS · SHIFTS OF THE SELECTED TYPE</div>`);

// ------------------------------------------------------------ transport and views
add(`<div class="pn" style="left:35px;top:740px;width:278px;height:80px"></div>`);
const btn = {};
const mk = (key, label, x, y, w) => {
  const b = add(`<div class="tb" style="left:${x}px;top:${y}px;width:${w}px">${label}</div>`);
  btn[key] = b;
  return b;
};
mk('play', '❚❚ Pause', 47, 752, 96);
mk('restart', '↺ Restart', 149, 752, 80);
mk('labels', 'Labels', 235, 752, 66);
add(`<div class="cp ab mu" style="left:47px;top:786px;font-weight:500">CAMERA</div>`);
VIEWS.forEach((v, i) => mk(v, v, 110 + i * 64, 782, 58));
add(`<div class="cp ab mu" style="left:35px;top:878px;width:1530px;text-align:center;font-size:8px;font-weight:500;opacity:.8">DRAG TO ORBIT · SCROLL TO ZOOM · SCHEMATIC MODELS FROM PUBLIC, GENERAL ENGINEERING KNOWLEDGE</div>`);
const tourChip = add(`<div class="tourchip"></div>`);
const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L13.5 22.7 L10 15.3 L17 15.3 Z" fill="#fff" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
const ringEl = add(`<div class="ring"></div>`);

// callouts
const calls = [];
for (let i = 0; i < 7; i++) {
  const d = add(`<div class="call"><b></b><span></span></div>`);
  const ln = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  ln.setAttribute('fill', 'none');
  ln.setAttribute('stroke', C.mute);
  svg.appendChild(ln);
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('fill', C.ink);
  svg.appendChild(dot);
  calls.push({d, ln, dot, b: d.querySelector('b'), s: d.querySelector('span')});
}
// label offsets (px) per type and anchor, from the hero view
const OFF = {
  conv: [-60, -80],
  packs: [0, -150],
  sets: [60, -110],
  sols: [150, 40],
  prim: [40, -120],
  sec: [170, 30],
  belt: [190, -40],
  clutch: [-40, -110],
  clact: [40, -90],
  gears: [60, -150],
  sleeve: [-150, 90],
  shact: [170, 60],
  k: [-30, -110],
  even: [40, -110],
  odd: [80, -140],
  act: [-120, 110],
  tcu: [160, 40],
  valves: [-170, 80],
};

// ------------------------------------------------------------ fit and quality
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

// ------------------------------------------------------------ state
let T = 0;
let t = 0;
let paused = false;
let type = q.get('type') || 'AT';
let typeAt = -9;
let prevType = type;
let view = q.get('view') || 'hero';
let labels = 1;
let labelsAt = -9;
let viewSince = -9;
const off = {az: 0, el: 0, k: 1};
const cam = {...VIEW[view]};
let ring = {t: -9, x: 0, y: 0};
const spot = (k) => {
  const b = k in tabs ? tabs[k] : btn[k];
  return [parseFloat(b.style.left) + (k in tabs ? 75 : parseFloat(b.style.width) / 2), parseFloat(b.style.top) + (k in tabs ? 26 : 10)];
};
const pulse = (k) => {
  const [x, y] = spot(k);
  ring = {t: T, x, y};
};
const setType = (ty) => {
  if (ty === type) return;
  prevType = type;
  type = ty;
  typeAt = T;
  t = 0;
  paused = false;
  viewSince = T;
  drawTicks();
};
const drawTicks = () => {
  tlTicks.innerHTML = '';
  for (const s of sims[type].shifts) tlTicks.appendChild(el(`<div class="ab" style="left:${TL.x + (s.t / DUR) * TL.w}px;top:${TL.y - 7}px;width:1px;height:6px;background:${C.ink}"></div>`));
};
drawTicks();

// tour: each type plays its launch; the cursor clicks the next tab
const LEG = DUR + 1.6;
const AP = {on: !q.has('notour'), t0: 0};
let lastInput = 0;
const startTour = () => {
  AP.on = true;
  AP.t0 = T;
  Object.assign(off, {az: 0, el: 0, k: 1});
  view = 'hero';
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
for (const ty of TYPES)
  tabs[ty].addEventListener('click', () => {
    takeOver();
    pulse(ty);
    setType(ty);
  });
for (const v of VIEWS)
  btn[v].addEventListener('click', () => {
    takeOver();
    pulse(v);
    view = v;
    viewSince = T;
    Object.assign(off, {az: 0, el: 0, k: 1});
  });
btn.play.addEventListener('click', () => {
  takeOver();
  pulse('play');
  if (t >= DUR - 0.01) t = 0;
  paused = !paused;
});
btn.restart.addEventListener('click', () => {
  takeOver();
  pulse('restart');
  t = 0;
  paused = false;
});
btn.labels.addEventListener('click', () => {
  takeOver();
  pulse('labels');
  labels = labels ? 0 : 1;
  labelsAt = T;
});
{
  const d = el(`<div class="hit" style="left:${TL.x - 8}px;top:${TL.y - 11}px;width:${TL.w + 16}px;height:22px"></div>`);
  ui.appendChild(d);
  const move = (e) => {
    const [x] = toStage(e.clientX, e.clientY);
    t = clamp((x - TL.x) / TL.w, 0, 1) * DUR;
    paused = true;
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
}
addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const ty = {1: 'AT', 2: 'CVT', 3: 'AMT', 4: 'DCT'}[e.key];
  if (ty) tabs[ty].click();
  else if (e.key === ' ') btn.play.click();
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
if (q.has('t')) {
  t = Number(q.get('t'));
  paused = true;
}

// ------------------------------------------------------------ the frame
if (AP.on) startTour();
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
    const c = (T - AP.t0) % (LEG * 4);
    const leg = Math.floor(c / LEG);
    const want = TYPES[leg];
    if (want !== type) setType(want);
    t = Math.min(DUR, c - leg * LEG);
    // glide to the next tab during the last second of the leg, click at its end
    const nextTy = TYPES[(leg + 1) % 4];
    const [nx, ny] = spot(nextTy);
    const [px, py] = spot(type);
    const u = ss(LEG - 1.4, LEG - 0.2, c - leg * LEG);
    const since = c - leg * LEG;
    cursor = {x: px + (nx - px) * u, y: py + 40 + (ny - py - 40) * u, press: u > 0.9, ring: since < 0.55 && T - AP.t0 > 1 ? 1 - since / 0.55 : 0, ringX: px, ringY: py};
  } else {
    if (T - lastInput > IDLE && !q.has('notour')) startTour();
    if (!paused) {
      t += dt;
      if (t >= DUR) {
        t = DUR;
        paused = true;
      }
    }
    const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
    cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
  }

  const k = ss(typeAt, typeAt + 0.7, T);
  const mix = Object.fromEntries(TYPES.map((x) => [x, x === type ? k : x === prevType ? 1 - k : 0]));
  const s = sims[type].sample(t);
  const states = {active: s, [type]: s};
  if (prevType !== type && k < 1) states[prevType] = sims[prevType].sample(DUR);
  const tgt = {...VIEW[view]};
  if (type === 'CVT' && view === 'hero') tgt.az = 52;
  tgt.az += off.az;
  tgt.el = clamp(tgt.el + off.el, -20, 85);
  tgt.d *= off.k;
  const kc = 1 - Math.exp(-dt / 0.3);
  cam.az += wrap(tgt.az - cam.az) * kc;
  for (const key of ['tx', 'ty', 'tz', 'el', 'd']) cam[key] += (tgt[key] - cam[key]) * kc;
  st.frame(states, mix, {...cam, az: cam.az * D2R, el: cam.el * D2R}, T);

  // ------------------------------------------------------------ overlay
  typeBig.textContent = type;
  typeName.textContent = NAME[type] + ' transmission';
  const stepped = type !== 'CVT';
  const shifting = stepped && s.ph >= 0;
  typeNow.innerHTML = stepped ? `gear <b style="color:${C.ink}">${shifting ? `${s.gear}→${s.next}` : s.gear}</b> of ${SPEC[type].ratios.length} · overall ${fmt(s.ratio, 1)} : 1` : `ratio <b style="color:${C.ink}">${fmt(s.ratio, 2)} : 1</b> overall · stepless`;
  let stTx = `${fmt(s.v * 3.6)} km/h · ${fmt(s.eng)} rpm · ${fmt(s.force / 1000, 1)} kN at the wheels`;
  if (shifting) {
    const what = {AT: 'clutch-to-clutch handover', AMT: s.a1 < 0.02 ? 'clutch open, no drive' : 'clutch moving', DCT: 'clutch crossover'}[type];
    stTx = `<span style="color:${C.red}">Shift ${s.gear}→${s.next} · ${what}</span>`;
  } else if (type === 'CVT' && s.t > 2.5) stTx += `<br><span style="color:${C.red}">engine held near ${fmt(Math.round(s.eng / 50) * 50)} rpm, ratio moving</span>`;
  stateTx.innerHTML = stTx;
  const J = JOB[type];
  jobSec.senses.textContent = J.senses;
  jobSec.drives.textContent = J.drives;
  jobSec.hard.textContent = J.hard;
  bars.forEach((b, i) => {
    const d = J.bars[i];
    const on = !!d;
    for (const n of [b.l, b.v, b.bk, b.f]) n.style.display = on ? 'block' : 'none';
    if (!on) return;
    const v = clamp(d[1](s), 0, 1);
    b.l.textContent = d[0];
    b.v.textContent = `${fmt(v * 100)}%`;
    b.f.style.width = `${v * 253}px`;
    b.f.style.background = shifting && v > 0.02 && v < 0.98 ? C.red : C.ink;
  });
  drawChart(fctx, 'f', 8000, [0, 2000, 4000, 6000, 8000], type, t);
  drawChart(rctx, 'e', 5000, [0, 1000, 2000, 3000, 4000, 5000], type, t);
  rowsT.forEach((bg, i) => (bg.style.background = TABLE[i][0] === type ? C.soft : 'transparent'));
  for (const ty of TYPES) tabs[ty].classList.toggle('on', ty === type);
  const kk = t / DUR;
  tlFill.style.width = `${kk * TL.w}px`;
  tlKnob.style.left = `${TL.x + kk * TL.w}px`;
  tlTime.textContent = `LAUNCH · ${fmt(t, 1)} / ${DUR} S`;
  btn.play.innerHTML = !AP.on && paused ? '▶ Play' : '❚❚ Pause';
  btn.labels.classList.toggle('on', !!labels);
  for (const v of VIEWS) btn[v].classList.toggle('on', view === v);

  const la = (labels ? ss(labelsAt, labelsAt + 0.4, T) : 1 - ss(labelsAt, labelsAt + 0.4, T)) * ss(viewSince + 0.5, viewSince + 1.1, T) * (view === 'hero' ? 1 : 0.0);
  const A = Object.entries(st.anchors[type]);
  calls.forEach((c, i) => {
    const a = A[i];
    const p = a && la > 0.01 ? st.project(a[1][0]) : null;
    if (!p) {
      c.d.style.display = 'none';
      c.ln.setAttribute('points', '');
      c.dot.setAttribute('r', '0');
      return;
    }
    const [ax, ay] = p;
    const o = OFF[a[0]] || [100, -60];
    const lx = clamp(ax + o[0], 340, 1270);
    const ly = clamp(ay + o[1], 200, 700);
    const right = lx >= ax;
    c.b.textContent = a[1][1];
    c.s.textContent = a[1][2];
    c.d.style.display = 'block';
    c.d.style.opacity = la;
    c.d.style.left = `${right ? lx + 6 : lx - 6}px`;
    c.d.style.top = `${ly - 9}px`;
    c.d.style.transform = right ? 'none' : 'translateX(-100%)';
    c.ln.setAttribute('points', `${ax},${ay} ${lx},${ly} ${lx + (right ? 4 : -4)},${ly}`);
    c.ln.setAttribute('opacity', la);
    c.dot.setAttribute('cx', ax);
    c.dot.setAttribute('cy', ay);
    c.dot.setAttribute('r', 2.5 * la);
  });
  cur.style.transform = `translate(${cursor.x - 2}px, ${cursor.y - 2}px) scale(${cursor.press ? 0.88 : 1})`;
  cur.style.display = cursor.x < 0 ? 'none' : 'block';
  ringEl.style.left = `${cursor.ringX}px`;
  ringEl.style.top = `${cursor.ringY}px`;
  ringEl.style.opacity = cursor.ring;
  if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
    tourChip.classList.toggle('on', AP.on);
    tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
  }
  requestAnimationFrame(frame);
};
warmComposer(st.renderer, st.composer, st.scene, st.camera)
  .catch(() => {})
  .then(() => requestAnimationFrame(frame));
