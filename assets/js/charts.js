/*
 * Wykresy na canvas: wykres Molliera h-x (t–x) z przemianami powietrza
 * oraz trendy dobowe (temperatury, siłowniki, moce, wilgotność/CO2).
 */
(function (root) {
  'use strict';
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const NB = ' ';
  const fmt = (v, d = 1) => {
    if (v == null || !isFinite(v)) return '—';
    const s = Math.abs(v).toFixed(d), [i, dec] = s.split('.');
    return (v < 0 && Number(s) !== 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, NB) + (dec ? ',' + dec : '');
  };

  function setup(cv) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  const font = (px, w = 400, mono = false) => `${w} ${px}px ${mono ? css('--mono') : css('--font')}`;

  // ================================================================ wykres h-x
  const HX = { xMin: 5, xMax: 15, tMin: 10, tMax: 35, pts: [], hover: null };

  function drawHX(cv, data, Psy) {
    const { ctx, w, h } = setup(cv);
    // zakres osi: zbliżenie na obszar przemian letnich, rozszerzane gdy punkty wychodzą poza
    const vis = data.points.filter((p) => !p.hide);
    const xs = vis.map((p) => p.x), ts = vis.map((p) => p.t);
    HX.xMin = Math.min(8, Math.floor(Math.min(...xs) - 0.6));
    HX.xMax = Math.max(13, Math.ceil(Math.max(...xs) + 0.6));
    HX.tMin = Math.min(12, Math.floor((Math.min(...ts) - 2) / 2) * 2);
    HX.tMax = Math.max(34, Math.ceil((Math.max(...ts) + 2) / 2) * 2);
    const m = { l: 54, r: 22, t: 16, b: 46 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const X = (x) => m.l + (x - HX.xMin) / (HX.xMax - HX.xMin) * pw;
    const Y = (t) => m.t + (1 - (t - HX.tMin) / (HX.tMax - HX.tMin)) * ph;
    const cGrid = css('--grid'), cGrid2 = css('--grid-2'), cText = css('--text-3'), cText2 = css('--text-2');
    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    // siatka
    ctx.lineWidth = 1;
    for (let x = Math.ceil(HX.xMin); x <= HX.xMax; x += 0.5) {
      ctx.strokeStyle = x % 1 === 0 ? cGrid2 : cGrid;
      ctx.beginPath(); ctx.moveTo(X(x), m.t); ctx.lineTo(X(x), m.t + ph); ctx.stroke();
    }
    for (let t = HX.tMin; t <= HX.tMax; t += 1) {
      ctx.strokeStyle = t % 2 === 0 ? cGrid2 : cGrid;
      ctx.beginPath(); ctx.moveTo(m.l, Y(t)); ctx.lineTo(m.l + pw, Y(t)); ctx.stroke();
    }
    // linie stałej entalpii (etykiety przy lewej lub górnej krawędzi)
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = cGrid2;
    ctx.fillStyle = cText; ctx.font = font(10.5);
    const tOfHX = (hh, x) => (hh - 2.501 * x) / (1.006 + 0.00186 * x);
    for (let hh = 20; hh <= 90; hh += 5) {
      ctx.beginPath();
      let first = true;
      for (let t = HX.tMin - 2; t <= HX.tMax + 2; t += 0.25) {
        const x = 1000 * (hh - 1.006 * t) / (2501 + 1.86 * t);
        if (x > Psy.xSat(t)) continue;
        const px = X(x), py = Y(t);
        if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      const tl = tOfHX(hh, HX.xMin + 0.08);
      if (tl > HX.tMin + 0.6 && tl < HX.tMax - 0.4 && HX.xMin + 0.08 < Psy.xSat(tl)) ctx.fillText(`h = ${hh}`, m.l + 5, Y(tl) - 4);
      else {
        const tt = HX.tMax - 0.5, xt = 1000 * (hh - 1.006 * tt) / (2501 + 1.86 * tt);
        if (xt > HX.xMin + 0.3 && xt < HX.xMax - 0.6) ctx.fillText(`h = ${hh}`, X(xt) + 4, Y(tt) + 4);
      }
    }
    ctx.setLineDash([]);
    // krzywe wilgotności względnej
    for (let rh = 10; rh <= 100; rh += 10) {
      ctx.beginPath();
      ctx.strokeStyle = rh === 100 ? cText2 : cGrid2;
      ctx.lineWidth = rh === 100 ? 2 : 1;
      let first = true, lab = null;
      for (let t = HX.tMin - 1; t <= HX.tMax + 1; t += 0.2) {
        const x = Psy.xFromRH(t, rh), px = X(x), py = Y(t);
        if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
        if (px <= m.l + pw - 6 && py >= m.t + 8) lab = [px, py];
      }
      ctx.stroke();
      if (lab && rh >= 30) {
        ctx.fillStyle = rh === 100 ? cText2 : cText; ctx.font = font(10.5, rh === 100 ? 600 : 400);
        ctx.fillText(`${rh}%`, lab[0] - 30, lab[1] + 4);
      }
    }
    ctx.restore();

    // osie
    ctx.strokeStyle = css('--line-2'); ctx.lineWidth = 1;
    ctx.strokeRect(m.l + 0.5, m.t + 0.5, pw, ph);
    ctx.fillStyle = cText; ctx.font = font(11, 400, true);
    ctx.textAlign = 'center';
    for (let x = Math.ceil(HX.xMin); x <= HX.xMax; x++) ctx.fillText(String(x), X(x), m.t + ph + 16);
    ctx.textAlign = 'right';
    for (let t = HX.tMin; t <= HX.tMax; t += 2) ctx.fillText(String(t), m.l - 8, Y(t) + 4);
    ctx.font = font(12, 500); ctx.fillStyle = cText2; ctx.textAlign = 'center';
    ctx.fillText('x — zawartość wilgoci [g/kg p.s.]', m.l + pw / 2, h - 10);
    ctx.save(); ctx.translate(16, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('t — temperatura [°C]', 0, 0); ctx.restore();

    // przemiany
    const P = {};
    for (const p of data.points) P[p.id] = p;
    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    for (const ln of data.lines) {
      const a = P[ln.from], b = P[ln.to];
      if (!a || !b || a.hide || b.hide) continue;
      ctx.strokeStyle = css(ln.color);
      ctx.lineWidth = ln.w || 2.6;
      ctx.setLineDash(ln.dash || []);
      ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.t)); ctx.lineTo(X(b.x), Y(b.t)); ctx.stroke();
      if (ln.arrow) {
        const ang = Math.atan2(Y(b.t) - Y(a.t), X(b.x) - X(a.x));
        const len = Math.hypot(Y(b.t) - Y(a.t), X(b.x) - X(a.x));
        if (len > 26) {
          const mx = X(a.x) + Math.cos(ang) * len * 0.55, my = Y(a.t) + Math.sin(ang) * len * 0.55;
          ctx.setLineDash([]); ctx.fillStyle = css(ln.color);
          ctx.beginPath();
          ctx.moveTo(mx + Math.cos(ang) * 7, my + Math.sin(ang) * 7);
          ctx.lineTo(mx + Math.cos(ang + 2.5) * 7, my + Math.sin(ang + 2.5) * 7);
          ctx.lineTo(mx + Math.cos(ang - 2.5) * 7, my + Math.sin(ang - 2.5) * 7);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    ctx.setLineDash([]);
    HX.pts = [];
    for (const p of data.points) {
      if (p.hide) continue;
      const px = X(p.x), py = Y(p.t);
      HX.pts.push({ p, px, py });
      ctx.fillStyle = css(p.color);
      ctx.strokeStyle = css('--panel');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, p.small ? 4.5 : 9, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (!p.small) {
        ctx.fillStyle = '#fff'; ctx.font = font(10.5, 700); ctx.textAlign = 'center';
        ctx.fillText(p.n, px, py + 3.8);
      }
      ctx.fillStyle = css('--text'); ctx.font = font(11.5, 600); ctx.textAlign = p.labelLeft ? 'right' : 'left';
      ctx.fillText(p.short, px + (p.labelLeft ? -14 : 14), py + (p.dy || 4));
    }
    ctx.restore();
  }

  function hxHit(mx, my) {
    let best = null, bd = 18;
    for (const q of HX.pts) {
      const d = Math.hypot(q.px - mx, q.py - my);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  // ================================================================ trendy
  const TR = { geo: null, hist: [], hoverT: null };
  const PANELS = [
    {
      id: 'temp', title: 'Temperatury [°C]', h: 0.36, unit: '°C', dec: 1, series: [
        { k: 'tO', n: 'Zewnętrzna TE-01', c: '--oda', w: 2 },
        { k: 'tR', n: 'Za wymiennikiem TE-02', c: '--mia', w: 1.4, dash: [4, 3] },
        { k: 'tC', n: 'Za chłodnicą TE-04', c: '--chwr', w: 1.4, dash: [2, 3] },
        { k: 'tS', n: 'Nawiew TE-05', c: '--sup', w: 2.2 },
        { k: 'spS', n: 'Zadana nawiewu', c: '--sup', w: 1.2, dash: [6, 4], alpha: 0.75 },
        { k: 'tE', n: 'Wywiew TE-06', c: '--eta', w: 2.2 },
        { k: 'spC', n: 'Zadana pomieszczenia', c: '--eta', w: 1.2, dash: [6, 4], alpha: 0.75 }
      ]
    },
    {
      id: 'act', title: 'Siłowniki i napędy [%]', h: 0.22, unit: '%', dec: 0, min: 0, max: 100, series: [
        { k: 'valve', n: 'Zawór chłodnicy Y1', c: '--chws', w: 2 },
        { k: 'rotor', n: 'Wymiennik W1', c: '--accent', w: 2 },
        { k: 'fresh', n: 'Przepustnica świeża D1', c: '--oda', w: 1.6 },
        { k: 'recirc', n: 'Recyrkulacja D3', c: '--rca', w: 1.6 },
        { k: 'sf', n: 'Wentylator SF', c: '--text-3', w: 1.2, dash: [4, 3] }
      ]
    },
    {
      id: 'pow', title: 'Moce [kW]', h: 0.22, unit: 'kW', dec: 1, min: 0, series: [
        { k: 'qCool', n: 'Chłodnica', c: '--sup', w: 2, fill: true },
        { k: 'qRecirc', n: 'Efekt recyrkulacji', c: '--rca', w: 1.6 },
        { k: 'qRec', n: 'Odzysk W1', c: '--oda', w: 1.6 },
        { k: 'fans', n: 'Wentylatory', c: '--text-3', w: 1.4 }
      ]
    },
    {
      id: 'hum', title: 'Wilgotność [%] / CO₂ [ppm]', h: 0.2, unit: '%', dec: 0, min: 20, max: 100, series: [
        { k: 'rhO', n: 'RH zewn. ME-01', c: '--oda', w: 1.4 },
        { k: 'rhE', n: 'RH wywiewu ME-06', c: '--eta', w: 2 },
        { k: 'co2', n: 'CO₂ QT-01 (oś prawa)', c: '--text-2', w: 1.4, dash: [5, 3], right: true }
      ], right: { min: 400, max: 1200, unit: 'ppm' }
    }
  ];
  const hidden = new Set(['tC']);
  const MODE_C = { OFF: '--text-3', NP: '#a78bfa', FC: '--oda', HR: '--rca', CR: '--sup' };
  const colorOf = (c) => (c[0] === '-' ? css(c) : c);

  function drawTrend(cv, hist) {
    const { ctx, w, h } = setup(cv);
    TR.hist = hist;
    const m = { l: 50, r: 52, t: 30, b: 26 }, gap = 26;
    const pw = w - m.l - m.r, avail = h - m.t - m.b - gap * (PANELS.length - 1);
    const X = (t) => m.l + (t % 86400) / 86400 * pw;
    const cGrid = css('--grid'), cGrid2 = css('--grid-2'), cText = css('--text-3'), cText2 = css('--text-2');
    let y0 = m.t;
    TR.geo = { m, pw, X, panels: [] };

    // pasek trybów
    ctx.font = font(11, 500); ctx.fillStyle = cText2; ctx.textAlign = 'left';
    ctx.fillText('Tryb pracy:', m.l, 13);
    let lx = m.l + 74;
    for (const [k, n] of [['NP', 'noc'], ['HR', 'odzysk ciepła'], ['FC', 'free cooling'], ['CR', 'odzysk chłodu + recyrk.'], ['OFF', 'postój']]) {
      ctx.fillStyle = colorOf(MODE_C[k]); ctx.fillRect(lx, 5, 12, 9);
      ctx.fillStyle = cText; ctx.fillText(n, lx + 16, 13);
      lx += ctx.measureText(n).width + 34;
    }
    for (let i = 0; i < hist.length; i++) {
      const a = hist[i], b = hist[i + 1];
      const x1 = X(a.t), x2 = b ? X(b.t) : x1 + pw / 1440;
      ctx.fillStyle = colorOf(MODE_C[a.mode] || '--text-3');
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x1, 19, Math.max(1, x2 - x1 + 0.5), 6);
    }
    ctx.globalAlpha = 1;

    for (const P of PANELS) {
      const ph = avail * P.h;
      const vis = P.series.filter((s) => !hidden.has(s.k) && !s.right);
      let lo = P.min, hi = P.max;
      if (lo == null || hi == null) {
        let mn = Infinity, mx = -Infinity;
        for (const r of hist) for (const s of vis) { const v = r[s.k]; if (v != null) { mn = Math.min(mn, v); mx = Math.max(mx, v); } }
        if (!isFinite(mn)) { mn = 0; mx = 1; }
        if (lo == null) lo = Math.floor((mn - 1) / 2) * 2;
        if (hi == null) hi = Math.ceil((mx + 1) / 2) * 2;
        if (P.id === 'pow') hi = Math.max(10, Math.ceil(mx / 10) * 10);
      }
      const Y = (v) => y0 + (1 - (v - lo) / (hi - lo)) * ph;
      TR.geo.panels.push({ P, y0, ph, Y, lo, hi });
      // tło i siatka
      ctx.strokeStyle = css('--line-2'); ctx.lineWidth = 1;
      ctx.strokeRect(m.l + 0.5, y0 + 0.5, pw, ph);
      const step = P.id === 'act' ? 25 : P.id === 'hum' ? 20 : niceStep((hi - lo) / 4);
      ctx.font = font(10.5, 400, true); ctx.textAlign = 'right';
      for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
        ctx.strokeStyle = cGrid2; ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(m.l + pw, Y(v)); ctx.stroke();
        ctx.fillStyle = cText; ctx.fillText(fmt(v, step < 1 ? 1 : 0), m.l - 6, Y(v) + 3.5);
      }
      for (let hh = 0; hh <= 24; hh += 2) {
        ctx.strokeStyle = hh % 6 === 0 ? cGrid2 : cGrid;
        ctx.beginPath(); ctx.moveTo(m.l + hh / 24 * pw, y0); ctx.lineTo(m.l + hh / 24 * pw, y0 + ph); ctx.stroke();
      }
      if (P.right) {
        const R = P.right, YR = (v) => y0 + (1 - (v - R.min) / (R.max - R.min)) * ph;
        ctx.textAlign = 'left';
        for (let v = R.min; v <= R.max; v += 200) { ctx.fillStyle = cText; ctx.fillText(String(v), m.l + pw + 6, YR(v) + 3.5); }
        TR.geo.panels[TR.geo.panels.length - 1].YR = YR;
      }
      ctx.font = font(11.5, 600); ctx.fillStyle = cText2; ctx.textAlign = 'left';
      ctx.fillText(P.title, m.l + 6, y0 + 14);
      // serie
      ctx.save(); ctx.beginPath(); ctx.rect(m.l, y0, pw, ph); ctx.clip();
      for (const s of P.series) {
        if (hidden.has(s.k)) continue;
        const YY = s.right ? TR.geo.panels[TR.geo.panels.length - 1].YR : Y;
        ctx.strokeStyle = colorOf(s.c); ctx.lineWidth = s.w || 1.5; ctx.setLineDash(s.dash || []);
        ctx.globalAlpha = s.alpha || 1;
        ctx.beginPath();
        let pen = false, firstX = null, lastX = null;
        for (const r of hist) {
          const v = r[s.k];
          if (v == null) { pen = false; continue; }
          const px = X(r.t), py = YY(v);
          if (!pen) { ctx.moveTo(px, py); pen = true; if (firstX == null) firstX = px; } else ctx.lineTo(px, py);
          lastX = px;
        }
        ctx.stroke();
        if (s.fill && firstX != null) {
          ctx.lineTo(lastX, YY(lo)); ctx.lineTo(firstX, YY(lo)); ctx.closePath();
          ctx.globalAlpha = 0.14; ctx.fillStyle = colorOf(s.c); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.setLineDash([]);
      ctx.restore();
      y0 += ph + gap;
    }
    // oś czasu
    ctx.font = font(10.5, 400, true); ctx.fillStyle = cText; ctx.textAlign = 'center';
    for (let hh = 0; hh <= 24; hh += 2) ctx.fillText(`${String(hh).padStart(2, '0')}:00`, m.l + hh / 24 * pw, h - 8);
    // linia "teraz"
    if (hist.length) {
      const xn = X(hist[hist.length - 1].t);
      ctx.strokeStyle = css('--accent'); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xn, m.t - 4); ctx.lineTo(xn, h - m.b); ctx.stroke(); ctx.setLineDash([]);
    }
    // kursor
    if (TR.hoverT != null && hist.length) {
      const xh = X(TR.hoverT);
      ctx.strokeStyle = css('--text-2'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xh, m.t); ctx.lineTo(xh, h - m.b); ctx.stroke();
    }
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }
  function trendAt(mx) {
    const g = TR.geo;
    if (!g || !TR.hist.length) return null;
    const t = (mx - g.m.l) / g.pw * 86400;
    if (t < 0 || t > 86400) return null;
    const base = TR.hist[0].t - (TR.hist[0].t % 86400);
    let best = null, bd = Infinity;
    for (const r of TR.hist) { const d = Math.abs((r.t - base) - t); if (d < bd) { bd = d; best = r; } }
    return bd < 600 ? best : null;
  }

  root.Charts = { drawHX, hxHit, HX, drawTrend, trendAt, TR, PANELS, hidden, fmt, colorOf };
})(window);
