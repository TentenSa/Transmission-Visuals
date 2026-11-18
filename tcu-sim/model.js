// The TCU's job as math: sense (pedal, speeds, temperature), decide (shift map with hysteresis), actuate (five
// pressure-control solenoids, one per shift element). One input drives everything: the driver's pedal and brake.
// The drive cycle is that input as a function of time; step() is the same code the "you drive" mode runs live.
//
// Public data only. Gear ratios and the shift-element table are those of a published 8-speed planetary automatic
// (ZF 8HP, 1st gen, as listed on Wikipedia): 4 gearsets, brakes A and B, clutches C, D and E, three closed per gear,
// every single-step shift swaps exactly one element. Vehicle, engine and calibration numbers are generic.

export const RATIOS = [4.714, 3.143, 2.106, 1.667, 1.285, 1.0, 0.839, 0.667];
export const ELEMS = ['A', 'B', 'C', 'D', 'E'];
export const KIND = {A: 'brake', B: 'brake', C: 'clutch', D: 'clutch', E: 'clutch'};
// closed elements per gear 1..8
export const ENGAGED = ['ABC', 'ABE', 'BCE', 'BDE', 'BCD', 'CDE', 'ACD', 'ADE'];
export const closed = (g, e) => ENGAGED[g - 1].includes(e);

export const VEH = {
  m: 1850, // kg
  r: 0.34, // m, tyre rolling radius
  fd: 2.813, // final drive
  eff: 0.92,
  cdA: 0.62, // m²
  crr: 0.011,
  idle: 720, // rpm
  tmax: 420, // N·m
  brake: 7.5, // m/s² at full brake
};
export const LOOP_MS = 10; // control task period shown on the page

// shift timing (s): fill, torque phase, inertia phase
export const SHIFT = {fill: 0.14, torque: 0.2, inertia: 0.3};
SHIFT.total = SHIFT.fill + SHIFT.torque + SHIFT.inertia;

const RPM = 60 / (2 * Math.PI);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;

/** Output-shaft rpm from vehicle speed (m/s). */
export const outRpm = (v) => (v / VEH.r) * VEH.fd * RPM;
/** Vehicle speed (km/h) at which gear g turns the turbine at rpm. */
export const kmhAt = (g, rpm) => ((rpm / RPM / VEH.fd / RATIOS[g - 1]) * VEH.r) * 3.6;

// the shift map, as engine-speed lines over pedal: upshift when the turbine passes up(p), downshift when it falls
// below down(p). The gap between them is the hysteresis that stops the box hunting between two gears.
export const upRpm = (p) => 1500 + 3700 * Math.pow(clamp(p, 0, 1), 1.2);
// braking raises the downshift line so the box is already in a low gear when the driver pulls away again
export const downRpm = (p, b = 0) => 880 + 1500 * Math.pow(clamp(p, 0, 1), 1.5) + 650 * clamp(b * 2, 0, 1);

const torqueCurve = (rpm) => {
  // generic turbo petrol: flat from 1600 to 4600, falling either side
  if (rpm < 1600) return lerp(0.62, 1, clamp((rpm - 800) / 800, 0, 1));
  if (rpm < 4600) return 1;
  return lerp(1, 0.78, clamp((rpm - 4600) / 1600, 0, 1));
};

export function initState() {
  return {
    t: 0,
    v: 0, // m/s
    x: 0, // m travelled
    gear: 1,
    from: 1,
    to: 1,
    ph: -1, // seconds into the current shift, -1 when none
    lastShift: -9,
    lock: 0, // torque-converter lock-up 0..1
    eng: VEH.idle,
    tur: 0,
    out: 0,
    ratio: RATIOS[0],
    P: [0, 0, 0, 0, 0], // bar, elements A..E
    pl: 5, // line pressure, bar
    tq: 0, // engine torque, N·m
    cut: 0, // torque reduction request 0..1
    acc: 0,
    temp: 42,
    angIn: 0, // shaft angles (rad), integrated
    angOut: 0,
    angEng: 0,
    pedal: 0,
    brake: 0,
    stage: 'stop', // stop | hold | fill | torque | inertia
  };
}

/** Where the TCU wants to be: the target gear for this speed and pedal. */
export function target(s, p, b = 0) {
  const v = s.v;
  if (v < 1.6) return 1;
  const tur = outRpm(v) * RATIOS[s.gear - 1];
  if (tur > upRpm(p) && s.gear < 8 && b < 0.05) return s.gear + 1;
  if (tur < downRpm(p, b) && s.gear > 1) {
    // a kickdown skips gears: the lowest gear that stays under the upshift line
    const lim = upRpm(p) * 0.9;
    let g = s.gear - 1;
    if (p > 0.6) while (g > 1 && outRpm(v) * RATIOS[g - 2] < lim) g--;
    return g;
  }
  return s.gear;
}

/** One control step. Mutates s. */
export function step(s, pedal, brake, dt) {
  s.pedal = pedal;
  s.brake = brake;
  s.t += dt;
  s.temp = Math.min(84, s.temp + dt * (0.55 + 1.2 * s.tq / VEH.tmax) * 0.6 * (1 - (s.temp - 42) / 60));

  // ------------------------------------------------ decide
  if (s.ph < 0 && s.t - s.lastShift > (brake > 0.05 ? 0.4 : 0.9)) {
    const g = target(s, pedal, brake);
    if (g !== s.gear) {
      s.from = s.gear;
      s.to = g;
      s.ph = 0;
    }
  }

  // ------------------------------------------------ actuate: element pressures and the ratio
  const demand = clamp(pedal * torqueCurve(s.eng), 0, 1);
  s.pl = 4.5 + 13.5 * demand; // line pressure follows torque
  let ratio = RATIOS[s.gear - 1];
  s.cut = 0;
  s.stage = s.v < 0.1 ? 'stop' : 'hold';
  if (s.ph >= 0) {
    const {fill, torque, inertia, total} = SHIFT;
    const a = RATIOS[s.from - 1];
    const b = RATIOS[s.to - 1];
    const ph = s.ph;
    for (let i = 0; i < 5; i++) {
      const e = ELEMS[i];
      const was = closed(s.from, e);
      const will = closed(s.to, e);
      let P = was ? s.pl : 0;
      if (!was && will) {
        // oncoming: a fill pulse, a low hold, a ramp through the torque phase, full in the inertia phase
        if (ph < fill * 0.45) P = 0.55 * s.pl;
        else if (ph < fill) P = 2.0;
        else if (ph < fill + torque) P = lerp(2.0, 0.7 * s.pl, (ph - fill) / torque);
        else P = lerp(0.7 * s.pl, s.pl, clamp((ph - fill - torque) / inertia, 0, 1));
      } else if (was && !will) {
        // offgoing: held through the fill, released through the torque phase
        if (ph < fill) P = s.pl;
        else P = lerp(s.pl, 0, clamp((ph - fill) / torque, 0, 1));
      }
      s.P[i] = P;
    }
    if (ph < fill) s.stage = 'fill';
    else if (ph < fill + torque) s.stage = 'torque';
    else s.stage = 'inertia';
    if (ph >= fill + torque) {
      const k = clamp((ph - fill - torque) / inertia, 0, 1);
      const e = k * k * (3 - 2 * k);
      ratio = lerp(a, b, e);
      // torque reduction requested over CAN through the inertia phase of an upshift
      if (s.to > s.from) s.cut = 0.35 * Math.sin(Math.PI * k);
    }
    s.ph += dt;
    if (s.ph >= total) {
      s.gear = s.to;
      s.ph = -1;
      s.lastShift = s.t;
      ratio = RATIOS[s.gear - 1];
    }
  } else {
    for (let i = 0; i < 5; i++) s.P[i] = closed(s.gear, ELEMS[i]) ? s.pl : 0;
  }
  s.ratio = ratio;

  // ------------------------------------------------ the driveline
  s.out = outRpm(s.v);
  s.tur = s.out * ratio;
  const lockWant = s.gear >= 3 && s.ph < 0 && pedal < 0.85 && s.tur > 1150 ? 1 : 0;
  s.lock += (lockWant - s.lock) * clamp(dt / 0.6, 0, 1);
  const slip = (1 - s.lock) * (180 + 1500 * pedal) * Math.exp(-s.tur / 2600);
  s.eng = Math.max(VEH.idle + 1300 * pedal * (1 - s.lock) * Math.exp(-s.tur / 900), s.tur + slip);
  s.tq = pedal * VEH.tmax * torqueCurve(s.eng) * (1 - s.cut);
  const tr = 1 + 0.9 * clamp(1 - s.tur / Math.max(1, s.eng), 0, 1) * (1 - s.lock); // converter multiplication
  // in the torque phase both elements share the load: the output torque dips toward the next gear's
  let r = ratio;
  if (s.stage === 'torque') r = lerp(RATIOS[s.from - 1], RATIOS[s.to - 1], (s.ph - SHIFT.fill) / SHIFT.torque);
  const drive = (s.tq * tr * r * VEH.fd * VEH.eff) / VEH.r;
  const v = s.v;
  const resist = 0.5 * 1.2 * VEH.cdA * v * v + (v > 0.05 ? VEH.crr * VEH.m * 9.81 : 0);
  let a = (drive - resist) / VEH.m - brake * VEH.brake;
  if (v <= 0 && a < 0) a = 0;
  // creep: an automatic in D rolls at walking pace with no pedal and no brake
  if (pedal < 0.02 && brake < 0.02 && v < 1.6) a = Math.max(a, (1.6 - v) * 0.6);
  s.acc = a;
  s.v = Math.max(0, v + a * dt);
  s.x += s.v * dt;
  s.angEng += (s.eng / RPM) * dt;
  s.angIn += (s.tur / RPM) * dt;
  s.angOut += (s.out / RPM) * dt;
  return s;
}

// ------------------------------------------------------------ the drive cycle
// Pedal and brake over time. Launch, cruise, a kickdown, cruise into 8th, brake to a stop.
export const CYCLE = {
  dur: 54,
  pedal: [[0, 0], [2.0, 0], [2.6, 0.36], [15.5, 0.36], [16.5, 0.14], [23, 0.14], [23.4, 0.95], [28.5, 0.95], [29.5, 0.16], [39, 0.16], [39.6, 0], [54, 0]],
  brake: [[0, 0.6], [1.8, 0.6], [2.2, 0], [40, 0], [40.8, 0.42], [48.5, 0.42], [49, 0.7], [54, 0.7]],
  phases: [[0, 'Standstill'], [2.2, 'Launch'], [15.8, 'Cruise'], [23.2, 'Kickdown'], [29, 'Cruise'], [40, 'Brake'], [48.5, 'Stop']],
};
const at = (keys, t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return a + (b - a) * k * k * (3 - 2 * k);
    }
  }
  return keys[keys.length - 1][1];
};
export const pedalAt = (t) => at(CYCLE.pedal, t);
export const brakeAt = (t) => at(CYCLE.brake, t);
export const phaseAt = (t) => {
  let p = CYCLE.phases[0][1];
  for (const [t0, n] of CYCLE.phases) if (t >= t0) p = n;
  return p;
};

const FIELDS = ['v', 'x', 'gear', 'from', 'to', 'ph', 'lock', 'eng', 'tur', 'out', 'ratio', 'pl', 'tq', 'cut', 'acc', 'temp', 'angIn', 'angOut', 'angEng', 'pedal', 'brake'];
const STAGES = ['stop', 'hold', 'fill', 'torque', 'inertia'];

/** The cycle simulated once at load into typed arrays; render only reads them. */
export function tabulate(hz = 200) {
  const n = Math.ceil(CYCLE.dur * hz) + 1;
  const dt = 1 / hz;
  const T = Object.fromEntries(FIELDS.map((f) => [f, new Float64Array(n)]));
  const P = Array.from({length: 5}, () => new Float32Array(n));
  const stage = new Uint8Array(n);
  const shifts = [];
  const s = initState();
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    if (i > 0) {
      const ph0 = s.ph;
      step(s, pedalAt(t), brakeAt(t), dt);
      if (ph0 < 0 && s.ph >= 0) shifts.push({t, from: s.from, to: s.to});
    } else {
      s.pedal = pedalAt(0);
      s.brake = brakeAt(0);
      for (let k = 0; k < 5; k++) s.P[k] = closed(1, ELEMS[k]) ? s.pl : 0;
      s.out = 0;
      s.tur = 0;
      s.eng = VEH.idle;
    }
    for (const f of FIELDS) T[f][i] = s[f];
    for (let k = 0; k < 5; k++) P[k][i] = s.P[k];
    stage[i] = STAGES.indexOf(s.stage);
  }
  /** The state at time t (seconds into the cycle), as a plain object like step()'s. */
  const sample = (t) => {
    const u = clamp(t, 0, CYCLE.dur) * hz;
    const i = Math.min(n - 2, Math.floor(u));
    const k = u - i;
    const o = {t};
    for (const f of FIELDS) o[f] = lerp(T[f][i], T[f][i + 1], k);
    for (const f of ['gear', 'from', 'to']) o[f] = T[f][i];
    o.ph = T.ph[i] < 0 ? -1 : lerp(T.ph[i], T.ph[i + 1] < 0 ? T.ph[i] : T.ph[i + 1], k);
    o.P = P.map((a) => lerp(a[i], a[i + 1], k));
    o.stage = STAGES[stage[i]];
    return o;
  };
  /** Element pressure history for the chart. */
  const pressure = (k, t) => {
    const u = clamp(t, 0, CYCLE.dur) * hz;
    return P[k][Math.min(n - 1, Math.round(u))];
  };
  return {sample, pressure, shifts, hz, n};
}
