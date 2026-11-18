// The overlay: title and gear top left, SENSE on the left, DECIDE (the shift map) and ACTUATE (solenoid pressures and
// the shift-element table) on the right, the drive-cycle timeline bottom centre, the pedal bottom left, views and
// layers bottom right, callouts with leaders into the 3D. Fixed 1600 x 900 CSS layout; update() redraws it.
import {CYCLE, ELEMS, ENGAGED, KIND, LOOP_MS, downRpm, kmhAt, upRpm} from './model.js';

export const C = {ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6', panel: 'rgba(248,248,249,.94)', red: '#d6182b', blue: '#2f7fd6', soft: '#eef0f2'};
export const VIEWS = ['hero', 'gearbox', 'tcu', 'valves'];
export const LAYERS = ['housing', 'signals', 'labels', 'open'];
const LABEL = {hero: 'Hero', gearbox: 'Gearbox', tcu: 'TCU', valves: 'Valves', housing: 'Housing', signals: 'Signals', labels: 'Labels', open: 'Open TCU'};

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.ab{position:absolute}
.tb{position:absolute;height:21px;padding:0 8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap;pointer-events:auto;cursor:pointer;user-select:none}
.tb.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.tb.acc.on{background:${C.red};border-color:${C.red}}
.row{position:absolute;left:0;right:0;height:38px}
.row .l{position:absolute;left:12px;top:5px;font-size:11.5px;font-weight:500}
.row .s{position:absolute;left:12px;top:21px;font-size:8px;font-weight:600;letter-spacing:1.3px;color:${C.mute}}
.row .v{position:absolute;right:12px;top:4px;font-size:15px;font-weight:700;letter-spacing:-.3px}
.row .u{font-size:9px;font-weight:600;letter-spacing:1px;color:${C.mute};margin-left:3px}
.row .bk{position:absolute;left:96px;right:12px;top:27px;height:4px;background:#e6e7e9}
.row .bf{position:absolute;left:96px;top:27px;height:4px;background:${C.ink}}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:11.5px;font-weight:600}
.call span{display:block;font-size:8.4px;font-weight:600;letter-spacing:1.3px;color:${C.mute};text-transform:uppercase;margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.red};opacity:0;z-index:49}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createConsole(app, shifts) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const svg = add(`<svg class="ab" style="left:0;top:0;width:1600px;height:900px;overflow:visible" viewBox="0 0 1600 900"></svg>`);

  // ------------------------------------------------------------ title and gear
  add(`<div class="ab" style="left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div class="ab" style="left:35px;top:47px;font-size:24px;font-weight:700;letter-spacing:-.2px">TCU <span style="color:${C.red}">·</span> Transmission Control</div>`);
  add(`<div class="cp ab" style="left:35px;top:81px;font-weight:500;letter-spacing:1.7px;font-size:9.4px">SENSE &nbsp;→&nbsp; DECIDE &nbsp;→&nbsp; ACTUATE &nbsp;•&nbsp; 8-SPEED PLANETARY AUTOMATIC &nbsp;•&nbsp; ${LOOP_MS} MS LOOP</div>`);
  const gearBig = add(`<div class="ab" style="left:33px;top:102px;font-size:58px;font-weight:800;letter-spacing:-2px;color:${C.red};line-height:1"></div>`);
  add(`<div class="cp ab mu" style="left:130px;top:110px">GEAR</div>`);
  const ratioTx = add(`<div class="ab" style="left:130px;top:126px;font-size:13px;font-weight:600"></div>`);
  const stageTx = add(`<div class="ab" style="left:35px;top:172px;width:300px;font-size:12.5px;font-weight:600"></div>`);
  const stageSub = add(`<div class="ab" style="left:35px;top:191px;width:300px;font-size:10.5px;line-height:1.35;color:${C.mute}"></div>`);

  // ------------------------------------------------------------ 1 · SENSE
  const SX = 35;
  const SY = 248;
  add(`<div class="pn" style="left:${SX}px;top:${SY}px;width:262px;height:300px"></div>`);
  add(`<div class="cp ab" style="left:${SX + 12}px;top:${SY + 12}px;font-weight:700"><span style="color:${C.red}">1</span> · SENSE</div>`);
  add(`<div class="cp ab mu" style="left:${SX + 150}px;top:${SY + 12}px;font-weight:500">INPUTS EVERY ${LOOP_MS} MS</div>`);
  const ROWS = [
    ['pedal', 'Accelerator', 'CAN · ECU', '%'],
    ['brake', 'Brake', 'CAN · ECU', '%'],
    ['eng', 'Engine', 'CAN · ECU', 'rpm'],
    ['tur', 'Turbine', 'SPEED SENSOR', 'rpm'],
    ['out', 'Output', 'SPEED SENSOR', 'rpm'],
    ['kmh', 'Road speed', 'FROM OUTPUT', 'km/h'],
    ['temp', 'Oil temp', 'SENSOR', '°C'],
  ];
  const rows = {};
  ROWS.forEach(([k, l, s, u], i) => {
    const r = add(`<div class="row" style="left:${SX}px;width:262px;top:${SY + 34 + i * 37}px"><div class="l">${l}</div><div class="s">${s}</div><div class="v"><span></span><span class="u">${u}</span></div><div class="bk"></div><div class="bf"></div></div>`);
    rows[k] = {v: r.querySelector('.v span'), f: r.querySelector('.bf')};
  });
  const MAX = {pedal: 100, brake: 100, eng: 6500, tur: 6500, out: 2500, kmh: 160, temp: 120};

  // ------------------------------------------------------------ 2 · DECIDE
  const DX = 1305;
  const DY = 36;
  add(`<div class="pn" style="left:${DX}px;top:${DY}px;width:262px;height:282px"></div>`);
  add(`<div class="cp ab" style="left:${DX + 12}px;top:${DY + 12}px;font-weight:700"><span style="color:${C.red}">2</span> · DECIDE</div>`);
  add(`<div class="cp ab mu" style="left:${DX + 146}px;top:${DY + 12}px;font-weight:500">SHIFT MAP</div>`);
  const map = add(`<canvas class="ab" width="476" height="340" style="left:${DX + 12}px;top:${DY + 32}px;width:238px;height:170px"></canvas>`);
  const mctx = map.getContext('2d');
  mctx.scale(2, 2);
  const decTx = add(`<div class="ab" style="left:${DX + 12}px;top:${DY + 212}px;width:238px;font-size:10.5px;line-height:1.55"></div>`);

  // ------------------------------------------------------------ 3 · ACTUATE
  const AX = 1305;
  const AY = 330;
  add(`<div class="pn" style="left:${AX}px;top:${AY}px;width:262px;height:372px"></div>`);
  add(`<div class="cp ab" style="left:${AX + 12}px;top:${AY + 12}px;font-weight:700"><span style="color:${C.red}">3</span> · ACTUATE</div>`);
  add(`<div class="cp ab mu" style="left:${AX + 128}px;top:${AY + 12}px;font-weight:500">SOLENOID PRESSURE</div>`);
  const pc = add(`<canvas class="ab" width="476" height="220" style="left:${AX + 12}px;top:${AY + 32}px;width:238px;height:110px"></canvas>`);
  const pctx = pc.getContext('2d');
  pctx.scale(2, 2);
  const actTx = add(`<div class="ab" style="left:${AX + 12}px;top:${AY + 148}px;width:238px;font-size:10.5px;line-height:1.55"></div>`);
  // the shift-element table
  const GX = AX + 12;
  const GY = AY + 198;
  add(`<div class="cp ab mu" style="left:${GX}px;top:${GY}px;font-weight:500">CLOSED ELEMENTS PER GEAR</div>`);
  const cells = [];
  ELEMS.forEach((e, j) => add(`<div class="ab" style="left:${GX + 44 + j * 38}px;top:${GY + 15}px;width:30px;text-align:center;font-size:10px;font-weight:700">${e}<span style="display:block;font-size:7px;font-weight:600;letter-spacing:.8px;color:${C.mute}">${KIND[e].toUpperCase()}</span></div>`));
  const rowBg = [];
  for (let g = 1; g <= 8; g++) {
    const y = GY + 40 + (g - 1) * 16;
    rowBg.push(add(`<div class="ab" style="left:${GX}px;top:${y - 2}px;width:238px;height:15px;background:transparent"></div>`));
    add(`<div class="ab" style="left:${GX + 8}px;top:${y}px;font-size:10px;font-weight:700">${g}</div>`);
    const r = [];
    ELEMS.forEach((e, j) => r.push(add(`<div class="ab" style="left:${GX + 55 + j * 38}px;top:${y + 2}px;width:8px;height:8px;border-radius:50%"></div>`)));
    cells.push(r);
  }

  // ------------------------------------------------------------ timeline (bottom centre)
  const TL = {x: 430, w: 740, y: 846};
  add(`<div class="ab" style="left:${TL.x}px;top:${TL.y}px;width:${TL.w}px;height:2px;background:${C.faint}"></div>`);
  const tlFill = add(`<div class="ab" style="left:${TL.x}px;top:${TL.y}px;height:2px;background:${C.ink}"></div>`);
  const tlKnob = add(`<div class="ab" style="top:${TL.y - 5}px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:${C.red};border:2px solid #fff;box-shadow:0 0 0 1px ${C.red}"></div>`);
  for (const [t0, n] of CYCLE.phases.filter(([t]) => t > 1)) add(`<div class="cp ab mu" style="left:${TL.x + (t0 / CYCLE.dur) * TL.w}px;top:${TL.y + 12}px;font-size:8px;font-weight:600">${n}</div>`);
  for (const s of shifts) {
    const x = TL.x + (s.t / CYCLE.dur) * TL.w;
    add(`<div class="ab" style="left:${x}px;top:${TL.y - 7}px;width:1px;height:6px;background:${s.to > s.from ? C.ink : C.mute}"></div>`);
  }
  const tlTime = add(`<div class="cp ab" style="left:${TL.x}px;top:${TL.y - 26}px;font-weight:600"></div>`);
  const modeTx = add(`<div class="cp ab mu" style="left:${TL.x + TL.w - 220}px;top:${TL.y - 26}px;width:220px;text-align:right;font-weight:600"></div>`);

  // ------------------------------------------------------------ transport and pedal (bottom left)
  add(`<div class="pn" style="left:35px;top:740px;width:300px;height:132px"></div>`);
  const btn = {};
  const mk = (key, label, x, y, w, extra = '') => {
    const b = add(`<div class="tb ${extra}" style="left:${x}px;top:${y}px;width:${w}px">${label}</div>`);
    btn[key] = b;
    return b;
  };
  mk('play', '❚❚ Pause', 47, 752, 96, 'acc on');
  mk('cycle', 'Drive cycle', 149, 752, 92);
  mk('restart', '↺', 247, 752, 34);
  add(`<div class="cp ab" style="left:47px;top:788px;font-weight:600">YOU DRIVE <span class="mu" style="font-weight:500">· DRAG</span></div>`);
  add(`<div class="cp ab mu" style="left:47px;top:806px;font-size:8.6px">ACCELERATOR</div>`);
  add(`<div class="cp ab mu" style="left:47px;top:836px;font-size:8.6px">BRAKE</div>`);
  const PD = {x: 140, w: 180};
  const sl = (y) => {
    add(`<div class="ab" style="left:${PD.x}px;top:${y}px;width:${PD.w}px;height:2px;background:${C.faint}"></div>`);
    const f = add(`<div class="ab" style="left:${PD.x}px;top:${y}px;height:2px;background:${C.ink}"></div>`);
    const k = add(`<div class="ab" style="top:${y - 5}px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#fff;border:2px solid ${C.ink}"></div>`);
    return {f, k, y};
  };
  const pedSl = sl(811);
  const brkSl = sl(841);

  // ------------------------------------------------------------ views and layers (bottom right)
  add(`<div class="pn" style="left:1305px;top:716px;width:262px;height:156px"></div>`);
  add(`<div class="cp ab mu" style="left:1317px;top:728px;font-weight:500">CAMERA</div>`);
  VIEWS.forEach((v, i) => mk(v, LABEL[v], 1317 + i * 61, 745, 56));
  add(`<div class="cp ab mu" style="left:1317px;top:780px;font-weight:500">LAYERS</div>`);
  LAYERS.forEach((k, i) => mk(k, LABEL[k], 1317 + (i % 2) * 120, 797 + Math.floor(i / 2) * 28, 114, k === 'open' ? 'acc' : ''));
  add(`<div class="cp ab mu" style="left:430px;top:880px;width:740px;text-align:center;font-size:8px;font-weight:500;opacity:.8">DRAG TO ORBIT · SCROLL TO ZOOM · GENERIC MODEL FROM PUBLIC DATA (GEAR RATIOS AND SHIFT LOGIC OF A PUBLISHED 8-SPEED); NOT A PRODUCTION CALIBRATION</div>`);

  // ------------------------------------------------------------ callouts
  const CALL = {
    tcu: ['Transmission control unit', 'sense · decide · actuate'],
    mcu: ['Microcontroller', `runs the ${LOOP_MS} ms shift task`],
    drivers: ['Solenoid drivers', 'current-controlled PWM'],
    conn: ['Connector', 'sensors in · solenoids out'],
    can: ['Vehicle CAN', 'pedal, engine torque in · gear, torque cut out'],
    sols: ['Pressure solenoids', 'one per shift element'],
    vb: ['Valve body', 'oil pressure to the packs'],
    tin: ['Turbine speed sensor', 'gearbox input'],
    tout: ['Output speed sensor', 'road speed'],
    temp: ['Oil temperature', 'sensor'],
    tc: ['Torque converter', 'with lock-up clutch'],
    gs: ['Planetary gearsets', '4 sets · 8 ratios'],
    out: ['Output', 'to the axle'],
  };
  const SHOW = {
    hero: ['tcu', 'sols', 'tin', 'tout', 'tc', 'can'],
    gearbox: ['A', 'B', 'C', 'D', 'E', 'out'],
    tcu: ['mcu', 'drivers', 'conn', 'can'],
    valves: ['sols', 'vb', 'temp', 'tcu'],
  };
  // label offsets (px from the anchor) where the radial default collides
  const OFF = {
    hero: {tc: [-70, -40], tin: [60, -60], tout: [70, -40], tcu: [-150, 40], sols: [190, 20], can: [-30, 60]},
    gearbox: {out: [-20, -130]},
    tcu: {mcu: [-170, -40], drivers: [40, -150], conn: [190, 30], can: [60, 80]},
    valves: {sols: [170, -110], vb: [60, 130], temp: [90, -60], tcu: [-160, 60]},
  };
  const calls = {};
  const allKeys = [...Object.keys(CALL), ...ELEMS];
  for (const k of allKeys) {
    const d = add(`<div class="call"><b></b><span></span></div>`);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    ln.setAttribute('fill', 'none');
    ln.setAttribute('stroke', C.mute);
    ln.setAttribute('stroke-width', '1');
    svg.appendChild(ln);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', C.ink);
    svg.appendChild(dot);
    calls[k] = {d, ln, dot, b: d.querySelector('b'), s: d.querySelector('span')};
  }

  // ------------------------------------------------------------ cursor
  const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L13.5 22.7 L10 15.3 L17 15.3 Z" fill="#fff" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
  const ringEl = add(`<div class="ring"></div>`);
  const spot = (k) => {
    const b = btn[k];
    return [parseFloat(b.style.left) + parseFloat(b.style.width) / 2, parseFloat(b.style.top) + 10];
  };

  // ------------------------------------------------------------ charts
  const MAPV = 160;
  const mapXY = (kmh, p) => [26 + (clamp(kmh, 0, MAPV) / MAPV) * 204, 150 - p * 132];
  const drawMap = (s) => {
    const c = mctx;
    c.clearRect(0, 0, 238, 170);
    c.font = '600 7.5px Inter';
    c.fillStyle = C.mute;
    c.strokeStyle = C.line;
    c.lineWidth = 1;
    for (let k = 0; k <= MAPV; k += 40) {
      const [x] = mapXY(k, 0);
      c.beginPath();
      c.moveTo(x, 14);
      c.lineTo(x, 150);
      c.stroke();
      c.fillText(String(k), x - 5, 162);
    }
    for (const p of [0, 0.5, 1]) {
      const [, y] = mapXY(0, p);
      c.fillText(`${p * 100}`, 2, y + 3);
    }
    c.fillText('KM/H', 205, 169);
    c.fillText('PEDAL %', 26, 8);
    const curve = (g, f, dash, col, w) => {
      c.save();
      c.beginPath();
      c.rect(26, 14, 204, 137);
      c.clip();
      c.beginPath();
      c.setLineDash(dash);
      c.strokeStyle = col;
      c.lineWidth = w;
      for (let i = 0; i <= 40; i++) {
        const p = i / 40;
        const x = 26 + (kmhAt(g, f(p)) / MAPV) * 204;
        const y = 150 - p * 132;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
      c.setLineDash([]);
      c.restore();
    };
    const g = s.gear;
    for (let n = 1; n <= 7; n++) curve(n, upRpm, [], n === g ? C.ink : C.faint, n === g ? 1.6 : 1);
    if (g < 8 && kmhAt(g, upRpm(0.7)) < MAPV * 0.82) {
      // name the live line where it crosses 70 % pedal
      const [x, y] = mapXY(kmhAt(g, upRpm(0.7)), 0.7);
      c.fillStyle = C.ink;
      c.font = '700 8px Inter';
      c.fillText(`${g}→${g + 1}`, x + 5, y + 3);
      c.font = '600 7.5px Inter';
    }
    if (g > 1) curve(g, (p) => downRpm(p, s.brake), [3, 3], C.mute, 1.2);
    // the operating point and its trail
    const [x, y] = mapXY(s.v * 3.6, s.pedal);
    c.fillStyle = C.red;
    c.beginPath();
    c.arc(x, y, 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(214,24,43,.35)';
    c.beginPath();
    c.arc(x, y, 8, 0, Math.PI * 2);
    c.stroke();
  };
  const drawPress = (s, hist) => {
    const c = pctx;
    c.clearRect(0, 0, 238, 110);
    const H = 92;
    const Y = (p) => 6 + H - (p / 20) * H;
    c.strokeStyle = C.line;
    c.lineWidth = 1;
    c.font = '600 7.5px Inter';
    c.fillStyle = C.mute;
    for (const p of [0, 10, 20]) {
      c.beginPath();
      c.moveTo(0, Y(p));
      c.lineTo(206, Y(p));
      c.stroke();
      c.fillText(`${p}`, 210, Y(p) + 3);
    }
    c.fillText('BAR', 210, 108);
    c.fillText('−10 S', 0, 108);
    c.fillText('NOW', 186, 108);
    const shifting = s.ph >= 0;
    for (let i = 0; i < 5; i++) {
      const e = ELEMS[i];
      const on = shifting && !ENGAGED[s.from - 1].includes(e) && ENGAGED[s.to - 1].includes(e);
      const off = shifting && ENGAGED[s.from - 1].includes(e) && !ENGAGED[s.to - 1].includes(e);
      c.strokeStyle = on ? C.red : off ? C.blue : 'rgba(22,24,27,.45)';
      c.lineWidth = on || off ? 1.8 : 1.1;
      c.beginPath();
      const N = hist.n;
      for (let j = 0; j < N; j++) {
        const x = (j / (N - 1)) * 206;
        const y = Y(hist.get(i, j));
        if (j) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
    }
  };

  // ------------------------------------------------------------ update
  const STAGE = {
    stop: ['Standing still', 'Gear 1 held ready: A, B and C closed, so the car creeps the moment the brake lifts.'],
    hold: ['Holding gear', 'Three elements closed, two open. The TCU watches the speed against the shift lines.'],
    fill: ['Fill', 'The oncoming element gets a short high-pressure pulse to push its piston up to the plates.'],
    torque: ['Torque phase', 'The load moves from the offgoing element to the oncoming one. The ratio has not changed yet.'],
    inertia: ['Inertia phase', 'The engine speed moves to the new gear. Over CAN the TCU asks the engine to cut torque.'],
  };
  const update = (s, x) => {
    const shifting = s.ph >= 0;
    gearBig.textContent = shifting ? `${s.from}→${s.to}` : `D${s.gear}`;
    gearBig.style.fontSize = shifting ? '46px' : '58px';
    gearBig.style.top = shifting ? '110px' : '102px';
    const gx = shifting ? 170 : 130;
    ratioTx.parentNode && (ratioTx.style.left = `${gx}px`);
    ratioTx.previousSibling.style.left = `${gx}px`;
    ratioTx.textContent = `ratio ${fmt(s.ratio, 3)} : 1`;
    const [st, sub] = STAGE[s.stage];
    stageTx.innerHTML = shifting ? `${s.to > s.from ? 'Upshift' : 'Downshift'} ${s.from} → ${s.to} <span style="color:${C.red}">· ${st}</span>` : st;
    stageSub.textContent = sub;

    const vals = {pedal: s.pedal * 100, brake: s.brake * 100, eng: s.eng, tur: s.tur, out: s.out, kmh: s.v * 3.6, temp: s.temp};
    for (const [k, r] of Object.entries(rows)) {
      r.v.textContent = fmt(vals[k], 0);
      r.f.style.width = `${(clamp(vals[k] / MAX[k], 0, 1) * 154).toFixed(1)}px`;
      r.f.style.background = (k === 'tur' || k === 'out') && shifting ? C.red : C.ink;
    }

    drawMap(s);
    const up = upRpm(s.pedal);
    const dn = downRpm(s.pedal, s.brake);
    const lock = s.lock > 0.95 ? 'closed' : s.lock > 0.05 ? 'slipping' : 'open';
    decTx.innerHTML = `<span class="mu">Upshift at</span> <b>${fmt(up)} rpm</b> <span class="mu">· down at</span> <b>${fmt(dn)}</b><br>${s.ph >= 0 ? `<span class="mu">Target gear</span> <b style="color:${C.red}">${s.to}</b> <span class="mu">from ${s.from}</span>` : `<span class="mu">Next</span> <b>${s.gear < 8 ? `${s.gear}→${s.gear + 1} at ${fmt(kmhAt(s.gear, up))} km/h` : 'top gear'}</b>`}<br><span class="mu">Converter lock-up</span> <b>${lock}</b>`;

    drawPress(s, x.hist);
    actTx.innerHTML = `<span class="mu">Line pressure</span> <b>${fmt(s.pl, 1)} bar</b><br><span class="mu">Torque cut request (CAN)</span> <b style="color:${s.cut > 0.01 ? C.red : C.ink}">${fmt(s.cut * 100)} %</b><br><span style="color:${C.red}">━</span> <span class="mu">oncoming</span> &nbsp;<span style="color:${C.blue}">━</span> <span class="mu">offgoing</span>`;
    for (let g = 1; g <= 8; g++) {
      const cur = shifting ? g === s.to || g === s.from : g === s.gear;
      rowBg[g - 1].style.background = cur ? C.soft : 'transparent';
      ELEMS.forEach((e, j) => {
        const d = cells[g - 1][j];
        const c = ENGAGED[g - 1].includes(e);
        let col = c ? (cur ? C.ink : C.faint) : 'transparent';
        let bd = c ? 'none' : `1px solid ${C.line}`;
        if (cur && shifting && g === s.to && c && !ENGAGED[s.from - 1].includes(e)) col = C.red;
        if (cur && shifting && g === s.from && c && !ENGAGED[s.to - 1].includes(e)) col = C.blue;
        d.style.background = col;
        d.style.border = bd;
      });
    }

    // timeline, transport, pedal
    const k = clamp(x.tc / CYCLE.dur, 0, 1);
    tlFill.style.width = `${k * TL.w}px`;
    tlKnob.style.left = `${TL.x + k * TL.w}px`;
    tlKnob.style.opacity = x.mode === 'cycle' ? 1 : 0.3;
    tlTime.textContent = x.mode === 'cycle' ? `DRIVE CYCLE · ${fmt(x.tc, 1)} / ${CYCLE.dur} S` : 'YOU ARE DRIVING';
    modeTx.textContent = x.mode === 'cycle' ? x.phase.toUpperCase() : 'PRESS DRIVE CYCLE TO RETURN';
    btn.play.innerHTML = x.paused ? '▶ Play' : '❚❚ Pause';
    btn.cycle.classList.toggle('on', x.mode === 'cycle');
    for (const [sl, v] of [[pedSl, s.pedal], [brkSl, s.brake]]) {
      sl.f.style.width = `${v * PD.w}px`;
      sl.k.style.left = `${PD.x + v * PD.w}px`;
    }
    for (const v of VIEWS) btn[v].classList.toggle('on', x.view === v);
    for (const l of LAYERS) btn[l].classList.toggle('on', !!x.layers[l]);

    // callouts
    const show = new Set(x.labels > 0.02 ? SHOW[x.view] : []);
    if (x.view === 'tcu' || x.view === 'hero') {
      if (x.explode < 0.5) show.delete('mcu'), show.delete('drivers');
    }
    const cx = 800;
    const cy = 430;
    allKeys.forEach((key, idx) => {
      const c = calls[key];
      const p = show.has(key) ? x.project(x.anchors[key]) : null;
      if (!p) {
        c.d.style.display = 'none';
        c.ln.setAttribute('points', '');
        c.dot.setAttribute('r', '0');
        return;
      }
      const [ax, ay] = p;
      let lx;
      let ly;
      if (ELEMS.includes(key)) {
        const i = ELEMS.indexOf(key);
        lx = ax;
        ly = ay - 58 - (i % 2) * 40;
        const P = s.P[i];
        c.b.textContent = `${KIND[key] === 'brake' ? 'Brake' : 'Clutch'} ${key}`;
        c.s.textContent = P > 0.5 ? `closed · ${fmt(P, 1)} bar` : 'open';
        c.b.style.color = P > 0.5 ? C.red : C.ink;
      } else {
        const o = (OFF[x.view] || {})[key];
        if (o) {
          lx = ax + o[0];
          ly = ay + o[1];
        } else {
          const dx = ax - cx;
          const dy = ay - cy;
          const L = Math.hypot(dx, dy) || 1;
          lx = ax + (dx / L) * 95;
          ly = ay + (dy / L) * 60 - 18;
        }
        c.b.textContent = CALL[key][0];
        c.s.textContent = CALL[key][1];
        c.b.style.color = C.ink;
      }
      lx = clamp(lx, 330, 1280);
      ly = clamp(ly, 230, 700);
      const right = lx >= ax;
      c.d.style.display = 'block';
      c.d.style.opacity = x.labels;
      c.d.style.left = `${right ? lx + 6 : lx - 6}px`;
      c.d.style.top = `${ly - 9}px`;
      c.d.style.transform = right ? 'none' : 'translateX(-100%)';
      if (ELEMS.includes(key)) {
        c.d.style.transform = 'translateX(-50%)';
        c.d.style.left = `${lx}px`;
        c.d.style.top = `${ly - 30}px`;
        c.d.style.textAlign = 'center';
      }
      c.ln.setAttribute('points', ELEMS.includes(key) ? `${ax},${ay} ${lx},${ly}` : `${ax},${ay} ${lx},${ly} ${lx + (right ? 4 : -4)},${ly}`);
      c.ln.setAttribute('opacity', x.labels);
      c.dot.setAttribute('cx', ax);
      c.dot.setAttribute('cy', ay);
      c.dot.setAttribute('r', 2.5 * x.labels);
      void idx;
    });

    // cursor
    const cr = x.cursor;
    cur.style.transform = `translate(${cr.x - 2}px, ${cr.y - 2}px) scale(${cr.press ? 0.88 : 1})`;
    cur.style.display = cr.x < 0 ? 'none' : 'block';
    ringEl.style.left = `${cr.ringX}px`;
    ringEl.style.top = `${cr.ringY}px`;
    ringEl.style.opacity = cr.ring;
    ringEl.style.transform = `scale(${1.6 - cr.ring * 0.6})`;
  };
  return {root: ui, btn, update, spot, TL, PD, pedY: pedSl.y, brkY: brkSl.y};
}
