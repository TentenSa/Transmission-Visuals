// The automated manual transaxle as a page you drive. One launch, 14 s, three upshifts; every shift runs the same five
// steps (open the clutch, sleeve out, select the gate, engage, close the clutch) and the page slows down through them
// so each actuator can be seen doing its part. The numbered parts follow the reference drawing.
import {warmComposer} from 'teardown-kit/warm.js';
import {DUR, SHIFT, SPEC, tabulateAll} from './model.js';
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

const VIEWS = ['drawing', 'actuators', 'clutch', 'gears'];
const VIEW = {
  drawing: {tx: -0.1, ty: -0.12, tz: 0.15, az: -38, el: 24, d: 6.4},
  actuators: {tx: -0.05, ty: -0.1, tz: 0.3, az: -16, el: 18, d: 5.6},
  clutch: {tx: -0.75, ty: -0.25, tz: 0.35, az: -62, el: 14, d: 4.2},
  gears: {tx: 0.15, ty: -0.1, tz: 0.0, az: -10, el: 42, d: 5.6},
};
const STEPS = [
  ['Open the clutch', '3 drives 4, the pipe feeds 2, 1 lets go', SHIFT.AMT.open],
  ['Sleeve out to neutral', '6 turns 5, the finger pulls the rail', SHIFT.AMT.out],
  ['Select the next gate', '7 lifts 5 to the next rail', SHIFT.AMT.select],
  ['Engage the new gear', '6 turns 5 the other way', SHIFT.AMT.in],
  ['Close the clutch', '3 backs off, 1 takes up the drive', SHIFT.AMT.close],
];
const T0 = [];
STEPS.reduce((a, s) => (T0.push(a), a + s[2]), 0);
const SHIFT_LEN = STEPS.reduce((a, s) => a + s[2], 0);

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
.num{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;border:1.5px solid ${C.ink};font-size:9.5px;font-weight:800;background:#fff;color:${C.ink}}
.num.on{background:${C.red};border-color:${C.red};color:#fff}
.call{position:absolute;white-space:nowrap;display:flex;align-items:center;gap:7px}
.call b{display:block;font-size:11.5px;font-weight:600}
.call span.s{display:block;font-size:8.4px;font-weight:600;letter-spacing:1.2px;color:${C.mute};text-transform:uppercase;margin-top:2px}
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
const sim = tabulateAll().AMT;
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

// ------------------------------------------------------------ title, gear, readouts
add(`<div class="ab" style="left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
add(`<div class="ab" style="left:35px;top:47px;font-size:24px;font-weight:700;letter-spacing:-.2px">AMT <span style="color:${C.red}">·</span> Automated Manual</div>`);
add(`<div class="cp ab" style="left:35px;top:81px;font-weight:500;letter-spacing:1.7px;font-size:9.4px">A MANUAL GEARBOX SHIFTED BY THE TCU &nbsp;•&nbsp; FIVE STEPS PER SHIFT &nbsp;•&nbsp; ${SPEC.AMT.ratios.length} SPEEDS</div>`);
const gearBig = add(`<div class="ab" style="left:33px;top:102px;font-size:58px;font-weight:800;letter-spacing:-2px;color:${C.red};line-height:1"></div>`);
const readout = add(`<div class="ab" style="left:150px;top:110px;font-size:12px;line-height:1.6"></div>`);

// ------------------------------------------------------------ the shift sequence (left)
add(`<div class="pn" style="left:35px;top:196px;width:290px;height:338px"></div>`);
add(`<div class="cp ab" style="left:47px;top:208px;font-weight:700">EVERY SHIFT, FIVE STEPS</div>`);
const stepRows = STEPS.map(([name, how], i) => {
  const y = 232 + i * 52;
  const bg = add(`<div class="ab" style="left:36px;top:${y - 4}px;width:288px;height:48px"></div>`);
  const n = add(`<div class="ab" style="left:47px;top:${y + 2}px;font-size:18px;font-weight:800;color:${C.faint}">${i + 1}</div>`);
  const t = add(`<div class="ab" style="left:72px;top:${y + 2}px;font-size:12.5px;font-weight:600">${name}</div>`);
  add(`<div class="ab mu" style="left:72px;top:${y + 20}px;font-size:10px">${how}</div>`);
  const bar = add(`<div class="ab" style="left:72px;top:${y + 37}px;height:3px;background:${C.red};width:0"></div>`);
  return {bg, n, t, bar};
});
const gapTx = add(`<div class="ab" style="left:47px;top:497px;width:270px;font-size:10.5px;line-height:1.4"></div>`);

// ------------------------------------------------------------ push at the wheels (right)
add(`<div class="pn" style="left:1290px;top:36px;width:277px;height:212px"></div>`);
add(`<div class="cp ab" style="left:1302px;top:48px;font-weight:700">PUSH AT THE WHEELS</div>`);
add(`<div class="cp ab mu" style="left:1500px;top:48px;width:55px;text-align:right;font-weight:500">KN</div>`);
const cv = add(`<canvas class="ab" width="506" height="300" style="left:1302px;top:66px;width:253px;height:150px"></canvas>`);
const cx = cv.getContext('2d');
cx.scale(2, 2);
add(`<div class="ab mu" style="left:1302px;top:222px;width:255px;font-size:9.5px;line-height:1.35">The flat zeros are the shifts: no drive while the clutch is open.</div>`);
const N = 500;
const FS = sim.series('force', N);
const drawChart = (t) => {
  const c = cx;
  c.clearRect(0, 0, 253, 150);
  const X = (u) => 22 + u * 222;
  const Y = (v) => 128 - (v / 8000) * 118;
  c.font = '600 7.5px Inter';
  c.strokeStyle = C.line;
  c.fillStyle = C.mute;
  for (const v of [0, 4000, 8000]) {
    c.beginPath();
    c.moveTo(22, Y(v));
    c.lineTo(244, Y(v));
    c.stroke();
    c.fillText(`${v / 1000}`, 4, Y(v) + 3);
  }
  for (let s = 0; s <= DUR; s += 2) c.fillText(`${s}`, X(s / DUR) - 3, 142);
  c.strokeStyle = 'rgba(22,24,27,.25)';
  c.lineWidth = 1.2;
  c.beginPath();
  for (let j = 0; j < N; j++) (j ? c.lineTo : c.moveTo).call(c, X(j / (N - 1)), Y(FS[j]));
  c.stroke();
  c.strokeStyle = C.red;
  c.lineWidth = 1.8;
  c.beginPath();
  const jn = Math.round((t / DUR) * (N - 1));
  for (let j = 0; j <= jn; j++) (j ? c.lineTo : c.moveTo).call(c, X(j / (N - 1)), Y(FS[j]));
  c.stroke();
};

// ------------------------------------------------------------ parts list (right)
add(`<div class="pn" style="left:1290px;top:260px;width:277px;height:276px"></div>`);
add(`<div class="cp ab" style="left:1302px;top:272px;font-weight:700">PARTS</div>`);
const partRows = st.parts.map(([n, name, sub], i) => {
  const y = 294 + i * 34;
  const b = add(`<div class="ab num" style="left:1302px;top:${y}px">${n}</div>`);
  add(`<div class="ab" style="left:1328px;top:${y}px;font-size:11.5px;font-weight:600">${name}</div>`);
  add(`<div class="ab mu" style="left:1328px;top:${y + 15}px;font-size:9.5px">${sub}</div>`);
  return b;
});

// ------------------------------------------------------------ timeline and controls (bottom)
const TL = {x: 380, w: 840, y: 832};
add(`<div class="ab" style="left:${TL.x}px;top:${TL.y}px;width:${TL.w}px;height:2px;background:${C.faint}"></div>`);
const tlFill = add(`<div class="ab" style="left:${TL.x}px;top:${TL.y}px;height:2px;background:${C.ink}"></div>`);
const tlKnob = add(`<div class="ab" style="top:${TL.y - 5}px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:${C.red};border:2px solid #fff;box-shadow:0 0 0 1px ${C.red}"></div>`);
for (const s of sim.shifts) {
  const x = TL.x + (s.t / DUR) * TL.w;
  add(`<div class="ab" style="left:${x - 1}px;top:${TL.y - 9}px;width:${Math.max(3, (SHIFT_LEN / DUR) * TL.w)}px;height:8px;background:${C.red};opacity:.35"></div>`);
  add(`<div class="cp ab" style="left:${x - 6}px;top:${TL.y - 24}px;font-size:8.4px">${s.from}→${s.to}</div>`);
}
const tlTime = add(`<div class="cp ab" style="left:${TL.x}px;top:${TL.y + 12}px;font-weight:600"></div>`);
add(`<div class="cp ab mu" style="left:${TL.x + TL.w - 300}px;top:${TL.y + 12}px;width:300px;text-align:right;font-weight:500;font-size:8.4px">RED · SHIFTS, PLAYED AT QUARTER SPEED</div>`);
add(`<div class="pn" style="left:35px;top:740px;width:290px;height:120px"></div>`);
const btn = {};
const mk = (key, label, x, y, w) => {
  const b = add(`<div class="tb" style="left:${x}px;top:${y}px;width:${w}px">${label}</div>`);
  btn[key] = b;
  return b;
};
mk('play', '❚❚ Pause', 47, 752, 84);
mk('restart', '↺ Restart', 137, 752, 76);
mk('slow', 'Slow shifts', 219, 752, 94);
add(`<div class="cp ab mu" style="left:47px;top:788px;font-weight:500">CAMERA</div>`);
VIEWS.forEach((v, i) => mk(v, v, 47 + i * 67, 804, 62));
mk('case', 'Case', 47, 832, 62);
mk('labels', 'Labels', 114, 832, 62);
add(`<div class="cp ab mu" style="left:380px;top:878px;width:840px;text-align:center;font-size:8px;font-weight:500;opacity:.8">DRAG TO ORBIT · SCROLL TO ZOOM · BUILT FROM A PUBLISHED CUTAWAY OF AN AUTOMATED MANUAL; GENERIC MODEL, NOT A PRODUCTION CALIBRATION</div>`);
const tourChip = add(`<div class="tourchip"></div>`);
const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L13.5 22.7 L10 15.3 L17 15.3 Z" fill="#fff" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
const ringEl = add(`<div class="ring"></div>`);

// callouts: the numbered circles on the model
const calls = st.parts.map(([n, name]) => {
  const d = add(`<div class="call"><span class="num">${n}</span><div><b>${name}</b></div></div>`);
  const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  ln.setAttribute('stroke', C.ink);
  ln.setAttribute('stroke-width', '1');
  svg.appendChild(ln);
  return {d, ln, num: d.querySelector('.num')};
});
// screen offsets per part for the drawing view
const OFF = {1: [-130, -90], 2: [-150, -40], 3: [-190, 40], 4: [-150, 70], 5: [140, 30], 6: [150, -40], 7: [-60, -80]};

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
const toStage = (x0, y0) => {
  const r = app.getBoundingClientRect();
  return [(x0 - r.left) / scale, (y0 - r.top) / scale];
};

// ------------------------------------------------------------ state
let T = 0;
let t = 0;
let paused = false;
let slow = true;
let view = q.get('view') || 'drawing';
let viewSince = -9;
let caseOn = 1;
let caseAt = -9;
let labels = 1;
let labelsAt = -9;
const off = {az: 0, el: 0, k: 1};
const cam = {...VIEW[view]};
let ring = {t: -9, x: 0, y: 0};
const spot = (k) => {
  const b = btn[k];
  return [parseFloat(b.style.left) + parseFloat(b.style.width) / 2, parseFloat(b.style.top) + 10];
};
const pulse = (k) => {
  const [x, y] = spot(k);
  ring = {t: T, x, y};
};
const rate = (tt) => {
  if (!slow) return 1;
  const s = sim.sample(tt);
  return s.ph >= 0 ? 0.25 : 1;
};

// the tour: one launch, cameras chosen around each shift, then again
const SCRIPT = [
  [2.4, 'clutch'],
  [3.05, 'actuators'],
  [4.6, 'drawing'],
  [6.2, 'gears'],
  [8.0, 'drawing'],
  [11.9, 'actuators'],
  [13.4, 'drawing'],
];
const AP = {on: !q.has('notour'), last: -1};
let lastInput = 0;
const startTour = () => {
  AP.on = true;
  AP.last = -1;
  t = 0;
  paused = false;
  slow = true;
  view = 'drawing';
  viewSince = T;
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
btn.slow.addEventListener('click', () => {
  takeOver();
  pulse('slow');
  slow = !slow;
});
btn.case.addEventListener('click', () => {
  takeOver();
  pulse('case');
  caseOn = caseOn ? 0 : 1;
  caseAt = T;
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
  const v = {1: 'drawing', 2: 'actuators', 3: 'clutch', 4: 'gears'}[e.key];
  if (v) btn[v].click();
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

// ------------------------------------------------------------ frame
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
    t += dt * rate(t);
    if (t >= DUR + 2) startTour();
    let idx = -1;
    for (let i = 0; i < SCRIPT.length; i++) if (t >= SCRIPT[i][0]) idx = i;
    if (idx !== AP.last && idx >= 0) {
      view = SCRIPT[idx][1];
      viewSince = T;
      const [x, y] = spot(view);
      ring = {t: T, x, y};
    }
    AP.last = idx;
    // the cursor rests on the view it last pressed
    if (idx >= 0) {
      const [x, y] = spot(SCRIPT[idx][1]);
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x, y, press: rk > 0.8, ring: rk, ringX: x, ringY: y};
    }
  } else {
    if (T - lastInput > IDLE && !q.has('notour')) startTour();
    if (!paused) {
      t += dt * rate(t);
      if (t >= DUR) {
        t = DUR;
        paused = true;
      }
    }
    const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
    cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
  }
  const s = sim.sample(Math.min(t, DUR));
  const tgt = {...VIEW[view]};
  tgt.az += off.az;
  tgt.el = clamp(tgt.el + off.el, -20, 85);
  tgt.d *= off.k;
  const kc = 1 - Math.exp(-dt / 0.35);
  cam.az += wrap(tgt.az - cam.az) * kc;
  for (const key of ['tx', 'ty', 'tz', 'el', 'd']) cam[key] += (tgt[key] - cam[key]) * kc;
  const caseK = caseOn ? ss(caseAt, caseAt + 0.5, T) : 1 - ss(caseAt, caseAt + 0.5, T);
  st.frame(s, {...cam, az: cam.az * D2R, el: cam.el * D2R}, {caseK}, T);

  // ------------------------------------------------------------ overlay
  const shifting = s.ph >= 0;
  gearBig.textContent = shifting ? `${s.gear}→${s.next}` : `${s.gear}`;
  gearBig.style.fontSize = shifting ? '44px' : '58px';
  readout.style.left = shifting ? '170px' : '110px';
  readout.innerHTML = `<b>${fmt(s.v * 3.6)}</b> <span class="mu">km/h</span> &nbsp; <b>${fmt(s.eng)}</b> <span class="mu">rpm</span><br><b>${fmt(s.force / 1000, 1)}</b> <span class="mu">kN at the wheels</span>`;
  let stepIdx = -1;
  if (shifting) for (let i = 0; i < 5; i++) if (s.ph >= T0[i]) stepIdx = i;
  stepRows.forEach((r, i) => {
    const on = i === stepIdx;
    const done = shifting && i < stepIdx;
    r.bg.style.background = on ? C.soft : 'transparent';
    r.n.style.color = on ? C.red : done ? C.ink : C.faint;
    r.t.style.color = on ? C.red : C.ink;
    const k = on ? clamp((s.ph - T0[i]) / STEPS[i][2], 0, 1) : done ? 1 : 0;
    r.bar.style.width = `${k * 230}px`;
  });
  gapTx.innerHTML = shifting
    ? `<span style="color:${C.red};font-weight:600">Shift ${s.gear}→${s.next}.</span> <span class="mu">Clutch ${fmt(s.a1 * 100)}% closed. The car coasts until step 5.</span>`
    : `<span class="mu">In gear ${s.gear}: clutch closed, finger idle. The TCU watches engine speed for the next upshift.</span>`;
  // which numbered parts are working right now
  const active = new Set();
  if (shifting) {
    if (stepIdx === 0 || stepIdx === 4) [1, 2, 3, 4].forEach((n) => active.add(n));
    if (stepIdx === 1 || stepIdx === 3) [5, 6].forEach((n) => active.add(n));
    if (stepIdx === 2) [5, 7].forEach((n) => active.add(n));
  } else if (s.gear === 1 && s.a1 < 0.99 && s.t > 0.8) [1, 2, 3, 4].forEach((n) => active.add(n));
  partRows.forEach((b, i) => b.classList.toggle('on', active.has(i + 1)));
  drawChart(Math.min(t, DUR));
  const kk = Math.min(t, DUR) / DUR;
  tlFill.style.width = `${kk * TL.w}px`;
  tlKnob.style.left = `${TL.x + kk * TL.w}px`;
  tlTime.textContent = `LAUNCH · ${fmt(Math.min(t, DUR), 1)} / ${DUR} S`;
  btn.play.innerHTML = !AP.on && paused ? '▶ Play' : '❚❚ Pause';
  btn.slow.classList.toggle('on', slow);
  btn.case.classList.toggle('on', !!caseOn);
  btn.labels.classList.toggle('on', !!labels);
  for (const v of VIEWS) btn[v].classList.toggle('on', view === v);

  const la = (labels ? ss(labelsAt, labelsAt + 0.4, T) : 1 - ss(labelsAt, labelsAt + 0.4, T)) * ss(viewSince + 0.5, viewSince + 1.1, T);
  st.parts.forEach(([n, , , p], i) => {
    const c = calls[i];
    const pp = la > 0.01 ? st.project(p) : null;
    if (!pp) {
      c.d.style.display = 'none';
      c.ln.setAttribute('x1', 0);
      c.ln.setAttribute('x2', 0);
      c.ln.setAttribute('y1', 0);
      c.ln.setAttribute('y2', 0);
      return;
    }
    const [ax, ay] = pp;
    const o = view === 'drawing' ? OFF[n] : [ax > 800 ? 110 : -110, -50];
    let lx = clamp(ax + o[0], 345, 1265);
    const ly = clamp(ay + o[1], 120, 760);
    const right = lx >= ax;
    const wd = c.d.offsetWidth || 180;
    if (right) lx = Math.min(lx, 1270 - wd);
    else lx = Math.max(lx, 340 + wd);
    c.d.style.display = 'flex';
    c.d.style.opacity = la;
    c.d.style.left = `${lx}px`;
    c.d.style.top = `${ly - 9}px`;
    c.d.style.transform = right ? 'none' : 'translateX(-100%)';
    c.d.style.flexDirection = right ? 'row' : 'row-reverse';
    c.num.classList.toggle('on', active.has(n));
    c.ln.setAttribute('x1', ax);
    c.ln.setAttribute('y1', ay);
    c.ln.setAttribute('x2', lx + (right ? 0 : 0));
    c.ln.setAttribute('y2', ly);
    c.ln.setAttribute('opacity', la * 0.7);
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
