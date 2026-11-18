// Four transmissions, one launch. Same car, same pedal; what changes is how each one changes ratio and therefore what
// the TCU has to control. Everything is simulated once at load into arrays (render only reads them).
// Generic numbers only: typical ratio spreads and shift times for each type, not any product's calibration.

export const TYPES = ['AT', 'CVT', 'AMT', 'DCT'];
export const NAME = {AT: 'Automatic', CVT: 'Continuously variable', AMT: 'Automated manual', DCT: 'Dual clutch'};

// gear ratios × final drive, chosen so every type starts near the same overall ratio (~13:1) and ends near ~2:1
export const SPEC = {
  AT: {ratios: [4.714, 3.143, 2.106, 1.667, 1.285, 1.0, 0.839, 0.667], fd: 2.813},
  DCT: {ratios: [3.9, 2.3, 1.5, 1.1, 0.88, 0.74, 0.62], fd: 3.4},
  AMT: {ratios: [3.6, 2.1, 1.4, 1.0, 0.8, 0.65], fd: 3.7},
  CVT: {range: [2.6, 0.42], fd: 5.1},
};
const VEH = {m: 1650, r: 0.33, cdA: 0.62, crr: 0.011, idle: 750, tmax: 340};
export const DUR = 14;
const RPM = 60 / (2 * Math.PI);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const sm = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
const torque = (rpm) => (rpm < 1500 ? lerp(0.6, 1, clamp((rpm - 800) / 700, 0, 1)) : rpm < 4800 ? 1 : lerp(1, 0.8, clamp((rpm - 4800) / 1400, 0, 1)));
export const pedalAt = (t) => 0.55 * sm((t - 0.8) / 0.6);
const UP = 3400; // rpm: every stepped box upshifts here at this pedal

// per-type shift timing (s)
export const SHIFT = {
  AT: {fill: 0.12, torque: 0.18, inertia: 0.3},
  DCT: {pre: 0.0, cross: 0.16, sync: 0.18},
  AMT: {open: 0.22, shift: 0.38, close: 0.32},
};

/** Simulate one type through the launch. Returns sample(t) and the shift list. */
function simulate(type, hz = 400) {
  const n = Math.ceil(DUR * hz) + 1;
  const dt = 1 / hz;
  const F = ['v', 'eng', 'inp', 'inp2', 'out', 'force', 'ratio', 'gear', 'next', 'ph', 'a1', 'a2', 'a3', 'a4', 'angEng', 'angIn', 'angIn2', 'angOut', 'belt', 'sel', 'sel2'];
  const A = Object.fromEntries(F.map((f) => [f, new Float32Array(n)]));
  const shifts = [];
  const sp = SPEC[type];
  let v = 0;
  let gear = 1;
  let next = 1;
  let ph = -1;
  let last = -9;
  let eng = VEH.idle;
  let lock = 0;
  let cvt = sp.range ? sp.range[0] : 0;
  let angEng = 0;
  let angIn = 0;
  let angIn2 = 0;
  let angOut = 0;
  let belt = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const p = pedalAt(t);
    const out = (v / VEH.r) * RPM; // wheel rpm; output shaft = wheel × fd
    const outShaft = out * sp.fd;
    let ratio;
    let force;
    let inp;
    let inp2 = 0;
    let a1 = 0;
    let a2 = 0;
    let a3 = 0;
    let a4 = 0;
    let sel = gear;
    let sel2 = 0;
    const tq = (r) => p * VEH.tmax * torque(r);
    if (type === 'CVT') {
      // hold the engine at a target speed for this pedal, let the ratio move; launch through the converter
      const target = 1500 + 2400 * p;
      const want = clamp((target / Math.max(outShaft, 1)) * 0.98, sp.range[1], sp.range[0]);
      cvt += (want - cvt) * clamp(dt / 0.35, 0, 1);
      ratio = cvt;
      inp = outShaft * ratio;
      lock += ((inp > 1300 ? 1 : 0) - lock) * clamp(dt / 0.8, 0, 1);
      const slip = (1 - lock) * (300 + 1800 * p) * Math.exp(-inp / 1600);
      eng = Math.max(VEH.idle + 1500 * p * (1 - lock) * Math.exp(-inp / 700), inp + slip);
      const tr = 1 + 0.9 * clamp(1 - inp / Math.max(1, eng), 0, 1) * (1 - lock);
      force = (tq(eng) * tr * ratio * sp.fd * 0.88) / VEH.r;
      a1 = (ratio - sp.range[1]) / (sp.range[0] - sp.range[1]); // primary pulley: 1 = small radius (low)
      a2 = 0.35 + 0.65 * p * torque(eng); // clamping pressure, relative
      a3 = lock;
    } else {
      const R = sp.ratios;
      if (ph < 0 && gear < R.length && t - last > 0.6 && outShaft * R[gear - 1] > UP) {
        next = gear + 1;
        ph = 0;
        shifts.push({t, from: gear, to: next});
      }
      const r0 = R[gear - 1];
      const r1 = R[next - 1];
      ratio = r0;
      let carry = 1; // share of engine torque reaching the output
      let rT = r0; // ratio the transmitted torque sees
      if (type === 'AT') {
        const S = SHIFT.AT;
        a1 = 1;
        if (ph >= 0) {
          const k1 = clamp((ph - S.fill) / S.torque, 0, 1);
          const k2 = clamp((ph - S.fill - S.torque) / S.inertia, 0, 1);
          rT = lerp(r0, r1, k1);
          ratio = lerp(r0, r1, sm(k2));
          carry = 1 - 0.3 * Math.sin(Math.PI * k2); // torque reduction in the inertia phase
          a1 = 1 - k1; // offgoing element
          a2 = ph < S.fill * 0.5 ? 0.6 : ph < S.fill ? 0.12 : lerp(0.12, 1, clamp((ph - S.fill) / (S.torque + S.inertia), 0, 1)); // oncoming
          if (ph >= S.fill + S.torque + S.inertia) {
            gear = next;
            ph = -1;
            last = t;
          }
        }
        inp = outShaft * ratio;
        lock += ((gear >= 3 && ph < 0 && inp > 1200 ? 1 : 0) - lock) * clamp(dt / 0.5, 0, 1);
        const slip = (1 - lock) * (220 + 1600 * p) * Math.exp(-inp / 1900);
        eng = Math.max(VEH.idle + 1500 * p * (1 - lock) * Math.exp(-inp / 800), inp + slip);
        const tr = 1 + 0.9 * clamp(1 - inp / Math.max(1, eng), 0, 1) * (1 - lock);
        force = (tq(eng) * carry * tr * rT * sp.fd * 0.92) / VEH.r;
        a3 = lock;
      } else if (type === 'DCT') {
        // odd gears on clutch 1, even on clutch 2; the next gear is already selected on the idle shaft
        const S = SHIFT.DCT;
        const odd = (g) => g % 2 === 1;
        sel = odd(gear) ? gear : Math.min(R.length, gear + 1);
        sel2 = odd(gear) ? Math.min(R.length, gear + 1) : gear;
        if (gear === R.length) {
          sel = odd(gear) ? gear : gear - 1;
          sel2 = odd(gear) ? gear - 1 : gear;
        }
        let c1 = odd(gear) ? 1 : 0;
        let c2 = 1 - c1;
        if (ph >= 0) {
          const k1 = sm(ph / S.cross);
          const k2 = clamp((ph - S.cross) / S.sync, 0, 1);
          rT = lerp(r0, r1, k1);
          ratio = lerp(r0, r1, sm(k2));
          carry = 1 - 0.18 * Math.sin(Math.PI * k2);
          if (odd(gear)) {
            c1 = 1 - k1;
            c2 = k1;
          } else {
            c2 = 1 - k1;
            c1 = k1;
          }
          if (ph >= S.cross + S.sync) {
            gear = next;
            ph = -1;
            last = t;
          }
        }
        // launch: the first clutch slips until the engine and gearbox meet
        inp = outShaft * ratio;
        const launch = clamp((inp - 900) / 900, 0, 1);
        eng = Math.max(inp, VEH.idle + (1700 + 600 * p) * (1 - launch) * clamp(p / 0.2, 0, 1));
        force = (tq(eng) * carry * rT * sp.fd * 0.94) / VEH.r;
        a1 = c1;
        a2 = c2;
        inp = outShaft * R[sel - 1];
        inp2 = outShaft * R[sel2 - 1];
      } else {
        // AMT: open the clutch, move the sleeve through neutral, close the clutch; no torque meanwhile
        const S = SHIFT.AMT;
        let clutch = 1;
        let fork = 0; // 0 in gear, 1 in neutral
        if (ph >= 0) {
          const {open, shift, close} = S;
          if (ph < open) {
            clutch = 1 - sm(ph / open);
          } else if (ph < open + shift) {
            clutch = 0;
            fork = Math.sin((Math.PI * (ph - open)) / shift);
          } else {
            clutch = sm((ph - open - shift) / close);
          }
          if (ph >= open + shift / 2) ratio = r1;
          rT = ratio;
          carry = clutch;
          if (ph >= open + shift + close) {
            gear = next;
            ph = -1;
            last = t;
          }
        }
        inp = outShaft * ratio;
        const launch = clamp((inp - 1000) / 900, 0, 1);
        const engFree = clamp(eng + (ph >= 0 ? -1800 * dt * (1 - carry) : 0), VEH.idle, 7000);
        const coupled = Math.max(inp, VEH.idle + (1600 + 600 * p) * (1 - launch) * clamp(p / 0.2, 0, 1));
        eng = ph >= 0 ? lerp(engFree, coupled, carry) : coupled;
        if (gear === 1 && ph < 0) clutch = launch > 0.99 ? 1 : 0.3 + 0.7 * launch;
        force = (tq(eng) * carry * rT * sp.fd * 0.95) / VEH.r;
        a1 = clutch;
        a2 = fork;
        sel = ph >= 0 && fork > 0.5 ? 0 : ratio === r1 && ph >= 0 ? next : gear;
      }
    }
    const resist = 0.5 * 1.2 * VEH.cdA * v * v + (v > 0.05 ? VEH.crr * VEH.m * 9.81 : 0);
    const acc = Math.max(0, (force - resist) / VEH.m);
    if (ph >= 0) ph += dt;
    v += acc * dt;
    angEng += (eng / RPM) * dt;
    angIn += (inp / RPM) * dt;
    angIn2 += (inp2 / RPM) * dt;
    angOut += (outShaft / RPM) * dt;
    belt += ((type === 'CVT' ? inp : 0) / RPM) * dt;
    const row = {v, eng, inp, inp2, out: outShaft, force, ratio: ratio * sp.fd, gear, next, ph, a1, a2, a3, a4, angEng, angIn, angIn2, angOut, belt, sel, sel2};
    for (const f of F) A[f][i] = row[f];
  }
  const sample = (t) => {
    const u = clamp(t, 0, DUR) * hz;
    const i = Math.min(n - 2, Math.floor(u));
    const k = u - i;
    const o = {t, type};
    for (const f of F) o[f] = lerp(A[f][i], A[f][i + 1], k);
    for (const f of ['gear', 'next', 'sel', 'sel2']) o[f] = A[f][i];
    o.ph = A.ph[i];
    o.pedal = pedalAt(t);
    return o;
  };
  const series = (f, N) => Array.from({length: N}, (_, j) => A[f][Math.min(n - 1, Math.round((j / (N - 1)) * (n - 1)))]);
  return {sample, shifts, series};
}

export function tabulateAll() {
  return Object.fromEntries(TYPES.map((t) => [t, simulate(t)]));
}
