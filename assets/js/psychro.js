/*
 * Psychrometria powietrza wilgotnego (wykres Molliera h-x).
 * Jednostki: t [°C], x [g/kg p.s.], h [kJ/kg p.s.], p [kPa], RH [%].
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Psy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const P0 = 100.9;    // ciśnienie barometryczne (Warszawa, ok. 110 m n.p.m.)
  const CP_A = 1.006;  // ciepło właściwe powietrza suchego
  const CP_V = 1.86;   // ciepło właściwe pary wodnej
  const R0 = 2501;     // ciepło parowania w 0 °C

  // Ciśnienie nasycenia pary wodnej (Magnus, Alduchov-Eskridge)
  function pSat(t) {
    return t >= 0
      ? 0.61094 * Math.exp(17.625 * t / (t + 243.04))
      : 0.61115 * Math.exp(22.452 * t / (t + 272.55));
  }
  const pw = (x, p = P0) => p * x / (622 + x);
  const xFromPw = (pv, p = P0) => 622 * pv / (p - pv);
  const xFromRH = (t, rh, p = P0) => xFromPw(rh / 100 * pSat(t), p);
  const rh = (t, x, p = P0) => 100 * pw(x, p) / pSat(t);
  const xSat = (t, p = P0) => xFromPw(pSat(t), p);
  const h = (t, x) => CP_A * t + x / 1000 * (R0 + CP_V * t);
  const tFromHX = (hh, x) => (hh - R0 * x / 1000) / (CP_A + CP_V * x / 1000);
  const cpm = (x) => CP_A + CP_V * x / 1000; // ciepło właściwe pow. wilgotnego na kg p.s.

  // Temperatura punktu rosy
  function tDew(x, p = P0) {
    const pv = pw(x, p);
    if (pv <= 0) return -60;
    const g = Math.log(pv / 0.61094);
    return 243.04 * g / (17.625 - g);
  }

  // Gęstość powietrza suchego zawartego w 1 m3 powietrza wilgotnego [kg p.s./m3]
  function rhoDA(t, x, p = P0) {
    const T = t + 273.15, pv = pw(x, p);
    return (p - pv) / (0.287055 * T);
  }

  // Temperatura termometru mokrego (bisekcja)
  function tWet(t, x, p = P0) {
    let lo = -20, hi = t;
    const ht = h(t, x);
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2, xs = xSat(m, p);
      const f = h(m, xs) - (xs - x) / 1000 * 4.186 * m - ht;
      if (f > 0) hi = m; else lo = m;
    }
    return (lo + hi) / 2;
  }

  function state(t, x, p = P0) {
    return { t, x, rh: Math.min(100, rh(t, x, p)), h: h(t, x), td: tDew(x, p) };
  }

  return { P0, CP_A, CP_V, pSat, pw, xFromRH, rh, xSat, h, tFromHX, cpm, tDew, rhoDA, tWet, state };
});
