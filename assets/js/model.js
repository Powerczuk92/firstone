/*
 * NW-1 — model fizyczny centrali nawiewno-wywiewnej z obrotowym (sorpcyjnym)
 * wymiennikiem odzysku, komorą recyrkulacji i chłodnicą wodną oraz symulacja
 * letniego dnia pracy (strefa biurowa, Warszawa, lipiec).
 *
 * Układ sekcji (góra: wywiew ←, dół: nawiew →):
 *   wywiew : ETA → T2 tłumik → F2 → komora mieszania → W1 wymiennik → EF → D2 → EHA
 *   nawiew : ODA → D1 → F1 → W1 wymiennik → komora mieszania (D3) → F3 → CC → SF → SUP
 *
 * Moduł nie zależy od DOM — działa w przeglądarce (window.AHU) i w Node (testy).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./psychro.js'));
  else root.AHU = factory(root.Psy);
})(typeof self !== 'undefined' ? self : this, function (Psy) {
  'use strict';

  const DAY = 86400;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const tod = (t) => (((t % DAY) + DAY) % DAY) / 3600;
  const pl = (v, d = 1) => v.toFixed(d).replace('.', ',').replace('-', '−');

  // Dzień 0 symulacji = środa 15.07.2026
  const EPOCH = Date.UTC(2026, 6, 15);
  const dayIndex = (t) => Math.floor(t / DAY);
  const dateOf = (t) => new Date(EPOCH + dayIndex(t) * DAY * 1000);
  const isWorkday = (t) => { const d = dateOf(t).getUTCDay(); return d >= 1 && d <= 5; };

  // ------------------------------------------------------------------ konfiguracja
  const CFG = {
    p: Psy.P0,
    site: 'Warszawa (ok. 110 m n.p.m.)',
    weather: { tMax: 30.4, tMin: 17.8, xMean: 11.0, xAmp: 0.35, co2: 420, sunrise: 4.55, sunset: 20.95 },
    zone: {
      name: 'Strefa biurowa open space, 2. piętro',
      area: 800, volume: 2400, people: 80,
      Ca: 19000,      // kJ/K — powietrze + wyposażenie
      Cm: 130000,     // kJ/K — masa akumulacyjna budynku
      hA: 6.0,        // kW/K — wymiana ciepła powietrze ↔ przegrody
      UA: 0.65,       // kW/K — przenikanie przez obudowę
      infACH: 0.10,   // 1/h — infiltracja przy wyłączonej centrali
      moistBuf: 5,    // buforowanie wilgoci przez materiały
      qPerson: 0.075, // kW ciepła jawnego na osobę
      wPerson: 70,    // g/h pary wodnej na osobę
      co2Person: 19,  // l/h CO2 na osobę
      lightBase: 0.15, lightMax: 3.6, equipBase: 1.8, equipMax: 9.5,
      solar: [[9.0, 2.0, 2.8], [12.8, 2.3, 4.0], [16.0, 2.1, 9.0]], // [godz., σ, kW] — elewacje E/S/W, żaluzje zewn.
      ductGain: 0.4   // K — zysk ciepła w kanałach nawiewnych
    },
    ahu: {
      tag: 'NW-1',
      qSupNom: 9600, qEtaNom: 9200,
      fanSup: { p0: 2000, c: 0.40, q0: 13000, eta: 0.63 },
      fanEta: { p0: 1500, c: 0.40, q0: 12500, eta: 0.60 },
      rotor: { UA: 12.9, epsCap: 0.90, kx: 0.82, a: 4.5, rpmMax: 12, dpNom: 125, dia: 1600 },
      coil: { mwNom: 2.0, twIn: 7.0, hAo: 6.0, hAi: 17, mAirNom: 3.15, R: 50, auth: 0.5, dpNom: 95, qNom: 52 },
      filters: {
        F1: { cls: 'ePM10 50% (M5)', dpInit: 50, dpFinal: 200, dpNom: 96, changed: '12.03.2026' },
        F3: { cls: 'ePM1 55% (F7)', dpInit: 80, dpFinal: 250, dpNom: 158, changed: '12.03.2026' },
        F2: { cls: 'ePM10 50% (M5)', dpInit: 50, dpFinal: 200, dpNom: 174, changed: '18.11.2025' }
      },
      dpExtSup: 290, dpExtEta: 240,
      runHours: { SF: 21436, EF: 21402, W1: 15877 }
    }
  };

  const DEFAULTS = {
    mode: 'AUTO',        // AUTO | ON | OFF
    spCool: 24.0,        // zadana temp. pomieszczenia — chłodzenie
    spHeat: 22.0,        // dolna granica komfortu (początek pasma kaskady)
    summerComp: true, compStart: 26.0, compSlope: 0.2, compMax: 1.5,
    supMin: 16.0, supMax: 22.0, supNeutral: 18.0,
    co2Sp: 900,
    dehum: true, xMax: 10.7,   // osuszanie — ograniczenie T nawiewu, gdy x wywiewu > xMax [g/kg]
    freshMin: 40,        // % — minimalny udział powietrza świeżego
    qSup: 9600, qEta: 9200,
    nightPurge: true, nightFrac: 0.65,
    schedOn: 6.0, schedOff: 19.0, purgeFrom: 22.0, purgeTo: 5.5
  };

  // ------------------------------------------------------------------ pogoda
  // ASHRAE: udział dobowej amplitudy temperatury, godziny słoneczne 1..24
  const DR = [0.88, 0.92, 0.95, 0.98, 1.00, 0.98, 0.91, 0.74, 0.55, 0.38, 0.23, 0.13,
    0.05, 0.00, 0.00, 0.06, 0.14, 0.24, 0.39, 0.50, 0.59, 0.68, 0.75, 0.82];
  function drFrac(hLocal) {
    const hs = (((hLocal - 1) % 24) + 24) % 24;       // czas słoneczny ≈ CEST − 1 h
    const k = Math.floor(hs), f = hs - k;
    const v = (i) => DR[(((i - 1) % 24) + 24) % 24];
    const p0 = v(k - 1), p1 = v(k), p2 = v(k + 1), p3 = v(k + 2);
    const f2 = f * f, f3 = f2 * f;                     // spline Catmulla-Roma
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  }
  const wobble = (t, seed) =>
    0.5 * Math.sin(t / 431 + seed * 1.7) + 0.3 * Math.sin(t / 1093 + seed * 4.1) + 0.2 * Math.sin(t / 2741 + seed * 2.3);

  function weather(t) {
    const w = CFG.weather, hl = tod(t);
    const T = w.tMax - (w.tMax - w.tMin) * drFrac(hl) + 0.35 * wobble(t, 1);
    const x = w.xMean + w.xAmp * Math.sin(2 * Math.PI * (hl - 9) / 24) + 0.15 * wobble(t, 2);
    const G = hl > w.sunrise && hl < w.sunset
      ? 830 * Math.pow(Math.sin(Math.PI * (hl - w.sunrise) / (w.sunset - w.sunrise)), 1.25) * (1 - 0.06 * (1 + wobble(t, 3)))
      : 0;
    return { t: T, x, G, co2: w.co2 + 8 * wobble(t, 4) };
  }

  // ------------------------------------------------------------------ obciążenia strefy
  const OCC = [[0, 0], [6.5, 0], [7.0, 0.15], [8.0, 0.75], [9.0, 0.95], [12.0, 0.95], [12.5, 0.70],
    [13.5, 0.72], [14.0, 0.95], [16.0, 0.90], [17.0, 0.50], [18.0, 0.20], [19.0, 0.08], [20.0, 0.02], [24, 0]];
  function occupancy(t) {
    if (!isWorkday(t)) return 0.02;
    const h = tod(t);
    for (let i = 1; i < OCC.length; i++) {
      if (h <= OCC[i][0]) {
        const [h0, v0] = OCC[i - 1], [h1, v1] = OCC[i];
        return lerp(v0, v1, (h - h0) / (h1 - h0));
      }
    }
    return 0;
  }
  function gains(t, occ, G) {
    const z = CFG.zone, N = z.people * occ, hl = tod(t);
    const people = N * z.qPerson;
    const day = clamp(G / 600, 0, 1);
    const lights = occ > 0.03 ? z.lightBase + z.lightMax * Math.min(1, occ * 1.15) * (1 - 0.4 * day) : z.lightBase;
    const equip = z.equipBase + z.equipMax * occ;
    let solar = 0;
    if (G > 0) for (const [c, s, q] of z.solar) solar += q * Math.exp(-0.5 * ((hl - c) / s) ** 2);
    solar *= clamp(G / 200, 0, 1);
    return {
      N, people, lights, equip, solar,
      conv: 0.6 * people + 0.5 * lights + 0.8 * equip + 0.3 * solar,
      rad: 0.4 * people + 0.5 * lights + 0.2 * equip + 0.7 * solar,
      W: N * z.wPerson / 3600,              // g/s
      co2: N * z.co2Person / 1000 / 3600     // m3/s
    };
  }

  // ------------------------------------------------------------------ elementy centrali
  // Zawór 3-drogowy: charakterystyka stałoprocentowa (R = 50) z liniowym odcinkiem
  // przy zamknięciu, zainstalowana z autorytetem a
  function valveFlow(y, R, a) {
    if (y <= 0) return 0;
    const y0 = 0.08;
    const inst = (u) => { const f = Math.pow(R, u - 1); return 1 / Math.sqrt(a / (f * f) + 1 - a); };
    return y < y0 ? inst(y0) * y / y0 : inst(Math.min(1, y));
  }

  const hSat = (t, p) => Psy.h(t, Psy.xSat(t, p));
  function tSatOfH(hh, p) {   // odwrotność entalpii nasycenia (Newton)
    let t = clamp((hh - 10) / 2.6, -10, 40);
    for (let i = 0; i < 8; i++) {
      const f = hSat(t, p) - hh, d = (hSat(t + 0.01, p) - hSat(t - 0.01, p)) / 0.02;
      const dt = f / d; t -= dt;
      if (Math.abs(dt) < 1e-4) break;
    }
    return t;
  }
  function cfEps(ntu, cr) {
    if (ntu <= 0) return 0;
    if (Math.abs(1 - cr) < 1e-6) return ntu / (1 + ntu);
    const e = Math.exp(-ntu * (1 - cr));
    return (1 - e) / (1 - cr * e);
  }

  // Chłodnica wodna — ε-NTU w potencjale entalpii (wężownica sucha / mokra, większa
  // z mocy), efektywna temperatura powierzchni (ADP) i współczynnik obejścia BF
  function coil(tin, xin, mAir, y, p) {
    const C = CFG.ahu.coil;
    const phi = valveFlow(y, C.R, C.auth), mw = phi * C.mwNom;
    const r = { phi, mw, flow: mw * 3.6, twIn: C.twIn, twOut: C.twIn, t: tin, x: xin, Q: 0, Qs: 0, Ql: 0, cond: 0, adp: null, wet: false, bf: null };
    if (mw < 1e-4 || mAir < 1e-3 || tin <= C.twIn + 0.3) { r.twOut = lerp(C.twIn, tin, 0.85); return r; }
    const cp = Psy.cpm(xin), cpw = 4.19, hin = Psy.h(tin, xin);
    const hAo = C.hAo * Math.pow(mAir / C.mAirNom, 0.6);   // strona powietrza (lamele)
    const hAi = C.hAi * Math.pow(phi, 0.8);                 // strona wody
    const bf = Math.exp(-hAo / (mAir * cp));
    // wężownica sucha
    const UAd = 1 / (1 / hAo + 1 / hAi), Ca = mAir * cp, Cw = mw * cpw;
    const Qd = cfEps(UAd / Math.min(Ca, Cw), Math.min(Ca, Cw) / Math.max(Ca, Cw)) * Math.min(Ca, Cw) * (tin - C.twIn);
    // wężownica mokra (potencjał entalpii, cs — nachylenie linii nasycenia)
    const tdp = Psy.tDew(xin, p);
    let Qw = 0;
    if (tdp > C.twIn + 0.2) {
      const hsw = hSat(C.twIn, p), cs = (hSat(tdp, p) - hsw) / (tdp - C.twIn);
      const UAw = 1 / (cp / hAo + cs / hAi), Cww = mw * cpw / cs;
      Qw = cfEps(UAw / Math.min(mAir, Cww), Math.min(mAir, Cww) / Math.max(mAir, Cww)) * Math.min(mAir, Cww) * (hin - hsw);
    }
    // moc = większa z analiz; stan wylotowy z efektywnej powierzchni (ADP):
    // jeżeli ADP < punkt rosy, następuje wykraplanie (wężownica mokra / częściowo mokra)
    const Q = Math.max(Qd, Qw), hout = hin - Q / mAir;
    const ts = tSatOfH(hin - (hin - hout) / (1 - bf), p);
    if (ts < tdp) {
      const xs = Psy.xSat(ts, p);
      r.x = Math.min(xin, xs + bf * (xin - xs));
      r.t = Psy.tFromHX(hout, r.x);
      r.adp = ts; r.wet = true;
    } else {
      r.t = tin - Q / Ca; r.x = xin;
      r.adp = r.t - bf * (tin - r.t) / (1 - bf);
    }
    r.Q = Q; r.bf = bf;
    r.twOut = C.twIn + Q / Cw;
    r.Qs = mAir * cp * (tin - r.t);
    r.Ql = Q - r.Qs;
    r.cond = mAir * (xin - r.x) / 1000 * 3600;
    return r;
  }

  // Wymiennik obrotowy sorpcyjny — ε-NTU (przeciwprąd), wpływ obrotów i niezrównoważenia
  function rotor(oda, eta, mS, mE, s) {
    const R = CFG.ahu.rotor;
    const r = { etaT: 0, etaX: 0, t: oda.t, x: oda.x, ex: { t: eta.t, x: eta.x }, Q: 0, Qs: 0 };
    if (s <= 0.001 || mS < 1e-3 || mE < 1e-3) return r;
    const Cs = mS * Psy.cpm(oda.x), Ce = mE * Psy.cpm(eta.x);
    const Cmin = Math.min(Cs, Ce), Cr = Cmin / Math.max(Cs, Ce);
    const eps = Math.min(cfEps(R.UA / Cmin, Cr), R.epsCap);
    const g = (1 - Math.exp(-R.a * s)) / (1 - Math.exp(-R.a));
    r.etaT = eps * Cmin / Cs * g;
    r.etaX = R.kx * r.etaT;
    r.t = oda.t - r.etaT * (oda.t - eta.t);
    r.x = Math.min(oda.x - r.etaX * (oda.x - eta.x), Psy.xSat(r.t, CFG.p));
    const hO = Psy.h(oda.t, oda.x), hR = Psy.h(r.t, r.x);
    r.Q = mS * (hO - hR);
    r.Qs = Cs * (oda.t - r.t);
    const xEx = eta.x + mS / mE * (oda.x - r.x);
    r.ex = { t: Psy.tFromHX(Psy.h(eta.t, eta.x) + mS / mE * (hO - hR), xEx), x: xEx };
    return r;
  }

  const dpDamper = (q, y, k) => k * (q / CFG.ahu.qSupNom) ** 2 / Math.max(y, 0.08) ** 2;

  function fanOp(q, dp, F) {
    if (q < 1) return { n: 0, P: 0, hz: 0, dp: 0, eta: 0 };
    const n = Math.min(1.05, Math.sqrt(Math.max(0, dp / F.p0 + F.c * (q / F.q0) ** 2)));
    const eta = F.eta * (0.72 + 0.28 * Math.min(1, n));
    return { n, hz: 50 * n, dp, eta, P: q / 3600 * dp / eta / 1000 };
  }

  // Przepływy, spadki ciśnienia i wentylatory (niezależne od stanu zaworu i wymiennika)
  function hydraulics(act, env) {
    const A = CFG.ahu, Qn = A.qSupNom, F = A.filters;
    const qS = act.qSup, f = act.fresh, qF = qS * f, qR = qS - qF;
    const qE = act.qEta, qX = Math.max(0, qE - qR);
    const rhoS = Psy.rhoDA(act.tSupRef, env.eta.x, env.p);
    const rhoE = Psy.rhoDA(env.eta.t, env.eta.x, env.p);
    const mS = qS / 3600 * rhoS, mF = mS * f, mR = mS - mF;
    const mE = qE / 3600 * rhoE, mX = Math.max(0, mE - mR);
    const rs = qS / Qn, re = qE / A.qEtaNom;
    const dp = {
      F1: F.F1.dpNom * (qF / Qn) ** 1.6,
      F3: F.F3.dpNom * rs ** 1.6,
      F2: F.F2.dpNom * re ** 1.6,
      CC: A.coil.dpNom * rs ** 1.8,
      DE: 22 * rs ** 2,
      rotS: A.rotor.dpNom * (qF / Qn) ** 1.2,
      rotE: A.rotor.dpNom * (qX / Qn) ** 1.2,
      extS: A.dpExtSup * rs ** 2,
      extE: A.dpExtEta * re ** 2
    };
    const pEmix = -(dp.extE + dp.F2 + 15 * re ** 2);
    const freshPath = 35 * (qF / Qn) ** 2 + dpDamper(qF, f, 12) + dp.F1 + dp.rotS;
    const pMix = f >= 0.995 ? -freshPath : Math.min(-freshPath, pEmix - dpDamper(qR, 1 - f, 15));
    const sf = fanOp(qS, -pMix + dp.F3 + dp.CC + dp.DE + 30 * rs ** 2 + dp.extS, A.fanSup);
    const ef = fanOp(qX, -pEmix + dp.rotE + dpDamper(qX, f, 12) + 55 * (qX / Qn) ** 2, A.fanEta);
    return {
      qS, qF, qR, qE, qX, f, mS, mF, mR, mE, mX, rhoS, dp, pMix, pEmix, sf, ef,
      ptSup: 0.82 * dp.extS, ptEta: -0.82 * dp.extE
    };
  }

  // Łańcuch termodynamiczny dla zadanych pozycji wymiennika i zaworu
  function thermal(env, hy, rot, valve) {
    const oda = env.oda, eta = env.eta;
    const R = rotor(oda, eta, hy.mF, hy.mX, rot);
    let mix = { t: eta.t, x: eta.x };
    if (hy.mS > 1e-3) {
      const x = (hy.mF * R.x + hy.mR * eta.x) / hy.mS;
      const hh = (hy.mF * Psy.h(R.t, R.x) + hy.mR * Psy.h(eta.t, eta.x)) / hy.mS;
      mix = { t: Psy.tFromHX(hh, x), x };
    }
    const C = coil(mix.t, mix.x, hy.mS, valve, env.p);
    const dTf = hy.mS > 1e-3 ? hy.sf.P / (hy.mS * Psy.cpm(C.x)) : 0;
    const dTe = hy.mX > 1e-3 ? hy.ef.P / (hy.mX * Psy.cpm(R.ex.x)) : 0;
    return { R, mix, C, dTf, sup: { t: C.t + dTf, x: C.x }, eha: { t: R.ex.t + dTe, x: R.ex.x } };
  }

  // Szukanie pozycji siłownika (bisekcja) — fn monotoniczna względem u ∈ [0, 1]
  function solve(fn, target, increasing) {
    const f0 = fn(0);
    if (increasing ? f0 >= target : f0 <= target) return 0;
    const f1 = fn(1);
    if (increasing ? f1 <= target : f1 >= target) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) {
      const m = 0.5 * (lo + hi), v = fn(m);
      if (increasing ? v < target : v > target) lo = m; else hi = m;
    }
    return 0.5 * (lo + hi);
  }

  // ------------------------------------------------------------------ symulacja
  const MODE_TXT = { OFF: 'Postój', DAY: 'Praca — program dzienny', NIGHT: 'Chłodzenie nocne (free cooling)' };
  const REG_TXT = {
    FC: 'Free cooling — 100 % powietrza świeżego',
    HR: 'Free cooling + odzysk ciepła',
    CR: 'Odzysk chłodu + recyrkulacja',
    NP: 'Przewietrzanie nocne — 100 % powietrza świeżego',
    OFF: 'Centrala zatrzymana'
  };
  const RATE = { d: 1 / 120, valve: 1 / 75, rotor: 1 / 30, fan: 1 / 45 };
  const E0 = () => ({ cool: 0, recCool: 0, recHeat: 0, recirc: 0, fans: 0, condensate: 0 });

  function createSim(opts = {}) {
    const ctl = Object.assign({}, DEFAULTS, opts.ctl || {});
    const manual = { valve: null, rotor: null, fresh: null, sf: null, ef: null };
    let s;

    function reset() {
      s = {
        t: -DAY,
        Ta: 25.0, Tm: 25.2, xa: 10.9, co2: 470,
        mode: 'OFF', modeT0: -DAY, regime: 'FC', regimeT0: -DAY, purge: false,
        act: { d: 0, d3: 0, rotor: 0, valve: 0, sf: 0, ef: 0 },
        pi: { c: 0, q: 0, d: 0 },
        supSP: ctl.supNeutral, spC: ctl.spCool, fresh: ctl.freshMin / 100,
        dehumOn: false, dehumDelta: 0, cleaning: false,
        tSupRef: 19, out: null, meas: null,
        E: E0(), hist: [], lastHist: -Infinity, events: [], alarms: []
      };
    }

    function log(lvl, text) {
      s.events.unshift({ t: s.t, lvl, text });
      if (s.events.length > 300) s.events.length = 300;
    }

    function step(dt) {
      const t = s.t + dt, hl = tod(t);
      const W = weather(t), occ = occupancy(t), Gn = gains(t, occ, W.G), p = CFG.p;
      const oda = { t: W.t, x: W.x }, eta = { t: s.Ta, x: s.xa };
      const env = { oda, eta, p };
      const hO = Psy.h(oda.t, oda.x), hA = Psy.h(eta.t, eta.x);

      // ---- tryb pracy (harmonogram + chłodzenie nocne)
      const work = isWorkday(t);
      const schedDay = work && hl >= ctl.schedOn && hl < ctl.schedOff;
      const nightWin = hl >= ctl.purgeFrom || hl < ctl.purgeTo;
      if (!s.purge && ctl.nightPurge && nightWin && s.Ta > 23.0 && oda.t < s.Ta - 3.0 && oda.t > 12) s.purge = true;
      if (s.purge && (!ctl.nightPurge || !nightWin || s.Ta < 21.5 || oda.t > s.Ta - 1.5 || oda.t < 11)) s.purge = false;
      let mode = 'OFF';
      if (ctl.mode === 'ON') mode = 'DAY';
      else if (ctl.mode === 'AUTO') mode = schedDay ? 'DAY' : (s.purge ? 'NIGHT' : 'OFF');
      if (mode !== s.mode) {
        const prev = s.mode;
        s.mode = mode; s.modeT0 = t;
        if (mode === 'DAY') log('info', ctl.mode === 'ON' ? 'Start centrali — praca wymuszona z BMS' : 'Start centrali wg harmonogramu (program dzienny)');
        else if (mode === 'NIGHT') log('info', `Start chłodzenia nocnego (t pom. ${pl(s.Ta)} °C, t zewn. ${pl(oda.t)} °C)`);
        else log('info', prev === 'NIGHT' ? 'Koniec chłodzenia nocnego — postój' : (ctl.mode === 'OFF' ? 'Centrala zatrzymana z BMS' : 'Stop centrali wg harmonogramu'));
        if (mode === 'DAY') s.regime = (oda.t > s.Ta || hO > hA + 2) ? 'CR' : 'FC';
        s.pi.c = 0; s.pi.q = 0; s.pi.d = 0;
      }

      const A = s.act, tgt = { d: 0, d3: 0, sf: 0, ef: 0, rotor: 0, valve: 0 };
      // kompensacja letnia temperatury zadanej pomieszczenia
      const comp = ctl.summerComp ? clamp((oda.t - ctl.compStart) * ctl.compSlope, 0, ctl.compMax) : 0;
      s.spC = ctl.spCool + comp;
      const running = A.sf > 0.8 && s.mode !== 'OFF';
      s.dehumOn = false; s.dehumDelta = 0;

      if (s.mode === 'DAY') {
        tgt.sf = 1; tgt.ef = 1;
        // przełączanie: free cooling ↔ odzysk chłodu z recyrkulacją (porównanie t i h)
        const dT = oda.t - s.Ta, dh = hO - hA;
        let reg = s.regime === 'HR' ? 'FC' : s.regime;
        if (reg === 'FC' && (dT > 1.0 || dh > 2.0)) reg = 'CR';
        else if (reg === 'CR' && dT < -1.0 && dh < 0) reg = 'FC';
        const fMin = ctl.freshMin / 100;
        if (running) {
          // regulator CO2 → udział powietrza świeżego (PI, ograniczenie od dołu: min. udział)
          const kq = 0.002, eq = s.co2 - ctl.co2Sp, uq = kq * eq + s.pi.q;
          if (!((uq >= 1 - fMin && eq > 0) || (uq <= 0 && eq < 0))) s.pi.q += kq / 900 * eq * dt;
          s.pi.q = clamp(s.pi.q, 0, 1 - fMin);
          s.fresh = clamp(fMin + kq * eq + s.pi.q, fMin, 1);
          // kaskada: w strefie martwej T nawiewu = f(T wywiewu) (pasmo P: spHeat → supMax,
          // spC → supNeutral), powyżej spC człon PI obniża nawiew aż do supMin
          const kc = 3.0, ec = s.Ta - s.spC, uc = kc * ec + s.pi.c, ucMax = ctl.supNeutral - ctl.supMin;
          if (!((uc >= ucMax && ec > 0) || (uc <= 0 && ec < 0))) s.pi.c += kc / 1200 * ec * dt;
          s.pi.c = clamp(s.pi.c, 0, ucMax);
          const kb = clamp((s.Ta - ctl.spHeat) / Math.max(0.5, s.spC - ctl.spHeat), 0, 1);
          let sp = lerp(ctl.supMax, ctl.supNeutral, kb) - clamp(uc, 0, ucMax);
          // osuszanie: PI na wilgotność bezwzględną wywiewu obniża zadaną T nawiewu
          // (bez dogrzewu — działa tylko, gdy pomieszczenie nie jest wychłodzone)
          if (ctl.dehum) {
            const kd = 1.2, ed = s.xa - ctl.xMax, udMax = Math.max(0, sp - ctl.supMin), ud = kd * ed + s.pi.d;
            if (!((ud >= udMax && ed > 0) || (ud <= 0 && ed < 0))) s.pi.d += kd / 1800 * ed * dt;
            s.pi.d = clamp(s.pi.d, 0, ctl.supMax - ctl.supMin);
            const w = clamp((s.Ta - ctl.spHeat - 0.3) / 1.0, 0, 1);
            s.dehumDelta = clamp(ud, 0, udMax) * w;
            s.dehumOn = s.dehumDelta > 0.05;
            sp -= s.dehumDelta;
          }
          s.supSP = sp;
        } else {
          s.fresh = reg === 'CR' ? fMin : 1;
        }
        if (manual.fresh != null) s.fresh = manual.fresh / 100;
        const fr = reg === 'CR' || manual.fresh != null ? s.fresh : 1;
        tgt.d = fr; tgt.d3 = 1 - fr;
        s.regimeNext = reg;
      } else if (s.mode === 'NIGHT') {
        tgt.d = 1; tgt.d3 = 0; tgt.sf = ctl.nightFrac; tgt.ef = ctl.nightFrac;
        s.regimeNext = 'FC';
      }
      // sekwencja startu/stopu: wentylatory po otwarciu przepustnic, przepustnice zamykane po zatrzymaniu
      if (s.mode !== 'OFF') {
        if (manual.sf != null) tgt.sf = manual.sf / 100;
        if (manual.ef != null) tgt.ef = manual.ef / 100;
        if (A.d + A.d3 < 0.9 * (tgt.d + tgt.d3)) { tgt.sf = Math.min(tgt.sf, A.sf); tgt.ef = Math.min(tgt.ef, A.ef); }
      } else if (A.sf > 0.03) { tgt.d = A.d; tgt.d3 = A.d3; }

      // ---- ruch siłowników (ograniczenie prędkości)
      const mv = (cur, to, rate) => cur + clamp(to - cur, -rate * dt, rate * dt);
      A.d = mv(A.d, tgt.d, RATE.d); A.d3 = mv(A.d3, tgt.d3, RATE.d);
      A.sf = mv(A.sf, tgt.sf, RATE.fan); A.ef = mv(A.ef, tgt.ef, RATE.fan);

      const fsum = A.d + A.d3;
      const hy = hydraulics({
        qSup: A.sf * ctl.qSup, qEta: A.ef * ctl.qEta,
        fresh: fsum > 0.02 ? clamp(A.d / fsum, 0, 1) : 1,
        tSupRef: s.tSupRef
      }, env);

      // ---- regulacja temperatury nawiewu: zawór chłodnicy / wymiennik (sekwencja)
      if (s.mode === 'DAY' && A.sf > 0.8) {
        const reg = s.regimeNext;
        const tAt = (rot, v) => thermal(env, hy, rot, v).sup.t;
        if (reg === 'CR') {
          tgt.rotor = 1;
          tgt.valve = solve((v) => tAt(A.rotor, v), s.supSP, false);
        } else if (tAt(0, 0) > s.supSP) {
          tgt.valve = solve((v) => tAt(A.rotor, v), s.supSP, false);
        } else if (s.Ta > oda.t + 0.5) {
          tgt.rotor = solve((r) => tAt(r, A.valve), s.supSP, true);
        }
        let newReg = reg;
        if (reg === 'FC' && (tgt.rotor > 0.02 || (s.regime === 'HR' && tgt.rotor > 0.005))) newReg = 'HR';
        if (newReg !== s.regime) {
          if (newReg === 'CR') log('info', `Przełączenie na odzysk chłodu z recyrkulacją (t zewn. ${pl(oda.t)} °C > t wyw. ${pl(s.Ta)} °C)`);
          else if (newReg === 'HR') log('info', 'Wymiennik W1: odzysk ciepła — ochrona przed zbyt zimnym nawiewem');
          else if (s.regime === 'HR') log('info', 'Wymiennik W1: koniec odzysku ciepła — postój wirnika');
          else log('info', `Przełączenie na free cooling — 100 % powietrza świeżego (t zewn. ${pl(oda.t)} °C)`);
          s.regime = newReg; s.regimeT0 = t;
        }
      }
      // cykl czyszczący wirnika podczas postoju (co 30 min przez 20 s)
      s.cleaning = false;
      const ph = ((t % 1800) + 1800) % 1800;
      if (s.mode !== 'OFF' && A.sf > 0.5 && tgt.rotor === 0 && ph >= 630 && ph < 650) { tgt.rotor = 0.03; s.cleaning = true; }
      if (manual.rotor != null && s.mode !== 'OFF') tgt.rotor = manual.rotor / 100;
      if (manual.valve != null) tgt.valve = manual.valve / 100;
      A.rotor = mv(A.rotor, tgt.rotor, RATE.rotor);
      A.valve = mv(A.valve, tgt.valve, RATE.valve);

      // ---- stan rzeczywisty centrali
      const th = thermal(env, hy, A.rotor, A.valve);
      s.tSupRef = hy.qS > 1 ? th.sup.t : lerp(oda.t, s.Ta, 0.5);

      // ---- strefa (model 2-węzłowy: powietrze + masa akumulacyjna)
      const z = CFG.zone, mSup = hy.mS, tSupRoom = th.sup.t + z.ductGain;
      const mInf = hy.qS > hy.qE + 50 ? 0 : z.infACH * z.volume * 1.18 / 3600;
      const cpa = Psy.cpm(s.xa);
      const Qair = Gn.conv + z.UA * (oda.t - s.Ta) + z.hA * (s.Tm - s.Ta) + mSup * cpa * (tSupRoom - s.Ta) + mInf * cpa * (oda.t - s.Ta);
      const Qm = Gn.rad + z.hA * (s.Ta - s.Tm);
      s.Ta += Qair / z.Ca * dt;
      s.Tm += Qm / z.Cm * dt;
      s.xa += (Gn.W + mSup * (th.sup.x - s.xa) + mInf * (oda.x - s.xa)) / (z.volume * 1.18 * z.moistBuf) * dt;
      s.co2 += (Gn.co2 * 1e6 + (hy.qF / 3600 + mInf / 1.18) * (W.co2 - s.co2)) / z.volume * dt;

      // ---- wyniki
      const fans = hy.sf.P + hy.ef.P, C = th.C;
      const out = {
        t, hl, day: dayIndex(t), work, mode: s.mode,
        regime: s.mode === 'DAY' ? s.regime : (s.mode === 'NIGHT' ? 'NP' : 'OFF'),
        W, occ, Gn,
        oda: Psy.state(oda.t, oda.x, p), eta: Psy.state(eta.t, eta.x, p),
        rot: Psy.state(th.R.t, th.R.x, p), mix: Psy.state(th.mix.t, th.mix.x, p),
        cc: Psy.state(C.t, C.x, p), sup: Psy.state(th.sup.t, th.sup.x, p),
        exr: Psy.state(th.R.ex.t, th.R.ex.x, p), eha: Psy.state(th.eha.t, th.eha.x, p),
        room: Psy.state(s.Ta, s.xa, p), Tm: s.Tm, co2: s.co2,
        hy, R: th.R, C, dTf: th.dTf,
        twRet: C.phi * C.twOut + (1 - C.phi) * C.twIn,
        act: Object.assign({}, A), tgt, spC: s.spC, comp, supSP: s.supSP,
        dehumOn: s.dehumOn, dehumDelta: s.dehumDelta, cleaning: s.cleaning, purge: s.purge,
        Qrec: th.R.Q, QrecS: th.R.Qs,
        Qrecirc: hy.mR * (hO - hA),
        Qcool: C.Q, fans,
        sfp: hy.qS > 1 ? fans / (Math.max(hy.qS, hy.qE) / 3600) : 0,
        sfpS: hy.qS > 1 ? hy.sf.P / (hy.qS / 3600) : 0,
        sfpE: hy.qX > 1 ? hy.ef.P / (hy.qX / 3600) : 0,
        Qroom: mSup * cpa * (s.Ta - tSupRoom)
      };
      s.out = out;

      // ---- pomiary (inercja czujników) i liczniki energii
      measure(out, dt);
      const kWh = dt / 3600;
      s.E.cool += out.Qcool * kWh;
      if (out.Qrec > 0) s.E.recCool += out.Qrec * kWh; else s.E.recHeat -= out.Qrec * kWh;
      if (out.Qrecirc > 0) s.E.recirc += out.Qrecirc * kWh;
      s.E.fans += fans * kWh;
      s.E.condensate += C.cond * kWh;

      alarms(out);
      if (dayIndex(t) !== dayIndex(s.t)) { s.hist = []; s.lastHist = -Infinity; s.E = E0(); }
      s.t = t;
      if (t >= 0 && t - s.lastHist >= 60) { s.lastHist = t - (t % 60); record(); }
    }

    // czujniki z inercją: τ ≈ 25 s przy przepływie powietrza, ≈ 15 min bez przepływu
    function measure(o, dt) {
      const flowS = o.hy.qS > 200, flowE = o.hy.qE > 200, flowW = o.C.mw > 0.02;
      const still = lerp(o.oda.t, o.room.t, 0.55);
      const tv = {
        TE01: o.oda.t, ME01: o.oda.rh,
        TE02: flowS ? o.rot.t : still, TE03: flowS ? o.mix.t : still, TE04: flowS ? o.cc.t : still,
        TE05: flowS ? o.sup.t : still, ME05: flowS ? o.sup.rh : Psy.rh(still, o.room.x),
        TE06: flowE ? o.eta.t : lerp(o.room.t, still, 0.3), ME06: flowE ? o.eta.rh : Psy.rh(lerp(o.room.t, still, 0.3), o.room.x),
        TE07: flowE ? o.exr.t : still, TE08: o.C.twIn, TE09: flowW ? o.C.twOut : lerp(o.C.twIn, still, 0.6),
        TE10: o.twRet, QT01: flowE ? o.co2 : lerp(o.co2, 450, 0.2)
      };
      const side = { TE02: flowS, TE03: flowS, TE04: flowS, TE05: flowS, ME05: flowS, TE06: flowE, ME06: flowE, TE07: flowE, QT01: flowE, TE09: flowW };
      if (!s.meas) { s.meas = Object.assign({}, tv); return; }
      for (const k in tv) {
        const fast = !(k in side) || side[k];
        const tau = fast ? (k === 'QT01' ? 60 : 25) : 900;
        s.meas[k] += (tv[k] - s.meas[k]) * (1 - Math.exp(-dt / tau));
      }
    }

    function alarms(o) {
      const list = [];
      for (const k of ['F1', 'F3', 'F2']) {
        const F = CFG.ahu.filters[k], use = (F.dpNom - F.dpInit) / (F.dpFinal - F.dpInit);
        if (use >= 0.8) list.push({ lvl: 'warn', code: 'FLT-' + k, text: `Filtr ${k} (${F.cls}) — zużycie ${Math.round(use * 100)} %, zaplanować wymianę` });
      }
      if (o.mode === 'DAY' && s.Ta > s.spC + 1.5 && o.act.sf > 0.8) list.push({ lvl: 'warn', code: 'TMP-HI', text: `Wysoka temperatura pomieszczenia — ${pl(s.Ta)} °C (zadana ${pl(s.spC)} °C)` });
      if (o.room.rh > 65 && o.mode === 'DAY') list.push({ lvl: 'warn', code: 'RH-HI', text: `Wysoka wilgotność w strefie — ${pl(o.room.rh, 0)} %` });
      if (s.co2 > ctl.co2Sp + 200) list.push({ lvl: 'warn', code: 'CO2-HI', text: `Wysokie stężenie CO2 — ${Math.round(s.co2)} ppm` });
      if (o.mode === 'DAY' && o.act.sf > 0.9 && o.sup.t < 14.5) list.push({ lvl: 'warn', code: 'SUP-LO', text: `Niska temperatura nawiewu — ${pl(o.sup.t)} °C` });
      if (ctl.mode === 'OFF') list.push({ lvl: 'info', code: 'MAN-OFF', text: 'Centrala zatrzymana z poziomu BMS' });
      if (ctl.mode === 'ON') list.push({ lvl: 'info', code: 'MAN-ON', text: 'Praca wymuszona z poziomu BMS — harmonogram pominięty' });
      const MAN = { valve: 'zawór chłodnicy Y1', rotor: 'wymiennik obrotowy W1', fresh: 'przepustnice mieszania D1/D2/D3', sf: 'wentylator nawiewny SF', ef: 'wentylator wywiewny EF' };
      for (const k in manual) if (manual[k] != null) list.push({ lvl: 'man', code: 'MAN-' + k, text: `Tryb ręczny: ${MAN[k]} — ${Math.round(manual[k])} %` });
      const prev = new Set(s.alarms.map((a) => a.code)), now = new Set(list.map((a) => a.code));
      for (const a of list) if (!prev.has(a.code) && a.lvl === 'warn') log('warn', a.text);
      for (const a of s.alarms) if (!now.has(a.code) && a.lvl === 'warn') log('ok', 'Ustąpiło: ' + a.text.split(' — ')[0]);
      s.alarms = list;
    }

    function record() {
      const o = s.out, m = s.meas;
      s.hist.push({
        t: s.lastHist, mode: o.regime,
        tO: m.TE01, tR: m.TE02, tM: m.TE03, tC: m.TE04, tS: m.TE05, tE: m.TE06, rhO: m.ME01, rhE: m.ME06, rhS: m.ME05,
        spS: o.mode === 'DAY' ? o.supSP : null, spC: o.spC,
        valve: o.act.valve * 100, rotor: o.act.rotor * 100, fresh: o.act.d * 100, recirc: o.act.d3 * 100,
        sf: o.hy.sf.n * 100, ef: o.hy.ef.n * 100,
        qCool: o.Qcool, qRec: o.Qrec, qRecirc: o.mode === 'DAY' && o.hy.mR > 0 ? Math.max(0, o.Qrecirc) : 0, fans: o.fans,
        co2: m.QT01, xO: o.oda.x, xE: o.room.x
      });
    }

    function advance(dtTotal, maxDt = 5) {
      while (dtTotal > 1e-9) { const dt = Math.min(maxDt, dtTotal); step(dt); dtTotal -= dt; }
    }

    // skok w czasie: do przodu — dosymulowanie, do tyłu — ponowna symulacja od rozbiegu
    function jumpTo(target) {
      if (target < s.t) { reset(); advance(target - s.t, 20); }
      else advance(target - s.t, 20);
      log('info', 'Operator: przestawienie czasu symulacji');
    }

    reset();
    advance((opts.start != null ? opts.start : 14.5 * 3600) - s.t, 20);

    return {
      get state() { return s; },
      get out() { return s.out; },
      get meas() { return s.meas; },
      get t() { return s.t; },
      ctl, manual, advance, jumpTo, log,
      setManual(k, v, label) {
        manual[k] = v;
        log('man', v == null ? `Operator: ${label} — powrót do trybu AUTO` : `Operator: ${label} — tryb ręczny ${Math.round(v)} %`);
      },
      setCtl(k, v, label, txt) {
        ctl[k] = v;
        log('info', `Operator: zmiana nastawy „${label}” → ${txt != null ? txt : v}`);
      }
    };
  }

  return {
    CFG, DEFAULTS, DAY, EPOCH, MODE_TXT, REG_TXT,
    tod, dateOf, dayIndex, isWorkday, weather, occupancy, gains, valveFlow, coil, rotor, hydraulics, thermal, createSim
  };
});
