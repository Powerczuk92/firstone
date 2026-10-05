/*
 * Synoptyka BMS centrali NW-1 (SVG generowane w JS) — budowa, aktualizacja wartości
 * i animacje (przepływy powietrza i wody, wentylatory, wirnik, przepustnice).
 */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  const R = { txt: {}, blades: {}, fans: {}, streams: [], pipes: [], man: {}, warn: {}, lamps: {} };
  let svg, onSelect = () => {};

  // ---------------------------------------------------------------- pomocnicze
  function T(parent, x, y, cls, text, anchor) {
    return el('text', { x, y, class: cls, 'text-anchor': anchor || 'start' }, parent, text);
  }
  // wartość z jednostką: <text><tspan val/> <tspan unit/></text>
  function V(parent, key, x, y, cls, unit, anchor) {
    const t = el('text', { x, y, class: cls || 't-val', 'text-anchor': anchor || 'start' }, parent);
    R.txt[key] = el('tspan', {}, t, '—');
    if (unit) el('tspan', { class: 't-unit', dx: 3 }, t, unit);
    return t;
  }
  function setT(key, str) {
    const n = R.txt[key];
    if (n && n.textContent !== str) n.textContent = str;
  }
  function comp(id, label, parent) {
    const g = el('g', { class: 'comp', 'data-comp': id, tabindex: 0, role: 'button', 'aria-label': label }, parent);
    g.addEventListener('click', () => onSelect(id));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); } });
    return g;
  }
  function hit(g, x, y, w, h) { return el('rect', { class: 'hit', x, y, width: w, height: h, rx: 6 }, g); }

  function sensor(parent, x, y, tag, stem) {
    const g = el('g', { class: 'sensor' }, parent);
    if (stem) el('line', { x1: x, y1: stem[0], x2: x, y2: stem[1] }, g);
    el('circle', { cx: x, cy: y, r: 10.5 }, g);
    el('text', { x, y: y + 0.5 }, g, tag);
    return g;
  }

  // ramka wartości: tytuł + wiersze [klucz, etykieta, jednostka]
  function box(parent, key, x, y, w, title, rows, opts = {}) {
    const rh = opts.rh || 18, th = title ? 22 : 6;
    const h = th + rows.length * rh + 6;
    const g = el('g', { class: 'vb' }, parent);
    const r = el('rect', { class: opts.panel ? 'panelbox' : 'vbox', x, y, width: w, height: h, rx: 6 }, g);
    if (key) R.warn[key] = r;
    if (title) {
      T(g, x + 9, y + 15, 't-ttl', title);
      if (opts.lamp) R.lamps[opts.lamp] = el('circle', { class: 'lamp off', cx: x + w - 12, cy: y + 11, r: 5 }, g);
    }
    rows.forEach((row, i) => {
      const yy = y + th + i * rh + 13;
      if (row[1]) T(g, x + 9, yy, 't-lbl', row[1]);
      V(g, row[0], x + w - 9, yy, 't-sm', row[2], 'end');
    });
    return { g, h, rect: r };
  }
  // pojedyncza wartość pomiarowa z etykietą (pod schematem)
  function mbox(parent, key, x, y, w, tag, unit) {
    const g = el('g', {}, parent);
    R.warn[key] = el('rect', { class: 'vbox', x, y, width: w, height: 42, rx: 6 }, g);
    T(g, x + 8, y + 15, 't-tag', tag);
    V(g, key, x + 8, y + 34, 't-val', unit);
    return g;
  }
  function leader(parent, pts) { return el('polyline', { class: 'leader', points: pts }, parent); }
  function manBadge(parent, id, x, y) {
    const g = el('g', { class: 'manbadge', visibility: 'hidden' }, parent);
    el('rect', { x: x - 8, y: y - 8, width: 16, height: 16, rx: 3 }, g);
    el('text', { x, y: y + 0.5 }, g, 'R');
    el('title', {}, g, 'Tryb ręczny (nadpisanie operatora)');
    R.man[id] = g;
  }

  // ---------------------------------------------------------------- symbole
  function damper(g, id, x, y, w, h, flow) {
    el('rect', { class: 'cline', x, y, width: w, height: h, rx: 2 }, g);
    const blades = [];
    const n = 4;
    for (let i = 0; i < n; i++) {
      let cx, cy, line;
      if (flow === 'h') {
        cx = x + w / 2; cy = y + h / n * (i + 0.5);
        line = el('line', { x1: cx - w * 0.36, y1: cy, x2: cx + w * 0.36, y2: cy, class: 'cline', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
      } else {
        cx = x + w / n * (i + 0.5); cy = y + h / 2;
        line = el('line', { x1: cx, y1: cy - h * 0.42, x2: cx, y2: cy + h * 0.42, class: 'cline', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
      }
      el('circle', { cx, cy, r: 1.6, fill: 'var(--comp-stroke)' }, g);
      blades.push({ line, cx, cy, sign: i % 2 ? -1 : 1 });
    }
    R.blades[id] = blades;
  }
  function actuator(g, x, y) {
    el('rect', { x, y, width: 16, height: 11, rx: 2, class: 'cfill' }, g);
    el('text', { x: x + 8, y: y + 8.6, 'text-anchor': 'middle', class: 't-tag', style: 'font-size:8px' }, g, 'M');
  }
  function fan(g, id, cx, cy, r, motorX) {
    el('circle', { cx, cy, r, class: 'cfill' }, g);
    el('circle', { cx, cy, r: r - 5, class: 'thin' }, g);
    const imp = el('g', {}, g);
    for (let i = 0; i < 7; i++) {
      const a = i * 2 * Math.PI / 7;
      const p = (rr, da) => [cx + rr * Math.cos(a + da), cy + rr * Math.sin(a + da)];
      const [x1, y1] = p(8, 0), [x2, y2] = p(r - 8, 0.55), [qx, qy] = p(r * 0.62, 0.05);
      el('path', { d: `M${x1.toFixed(1)},${y1.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`, class: 'cline', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, imp);
    }
    el('circle', { cx, cy, r: 7, class: 'cfill' }, imp);
    el('rect', { x: motorX, y: cy - 10, width: 18, height: 20, rx: 2, class: 'cfill' }, g);
    el('text', { x: motorX + 9, y: cy + 4, 'text-anchor': 'middle', class: 't-tag', style: 'font-size:9px' }, g, 'M');
    R.fans[id] = { imp, cx, cy, angle: 0 };
  }
  function pleatFilter(g, x, y, w, h) {
    el('rect', { x, y, width: w, height: h, rx: 2, class: 'cfill', 'fill-opacity': 0.55 }, g);
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) pts.push(`${(i % 2 ? x + w - 5 : x + 5)},${(y + 4 + (h - 8) * i / n).toFixed(1)}`);
    el('polyline', { points: pts.join(' '), class: 'cline', 'stroke-width': 1.3 }, g);
  }
  function bagFilter(g, x, y, w, h, dir) {
    el('rect', { x, y, width: w, height: h, rx: 2, class: 'cline' }, g);
    const n = 4, ph = h / n;
    for (let i = 0; i < n; i++) {
      const y0 = y + i * ph;
      const base = dir > 0 ? x + 3 : x + w - 3, tip = dir > 0 ? x + w - 6 : x + 6;
      el('polygon', { points: `${base},${y0 + 2} ${tip},${y0 + ph / 2} ${base},${y0 + ph - 2}`, class: 'cfill', 'fill-opacity': 0.7, 'stroke-width': 1.2 }, g);
    }
  }
  function louvre(g, x, y, w, h) {
    el('rect', { x, y, width: w, height: h, class: 'duct' }, g);
    for (let i = 0; i < 6; i++) {
      const yy = y + 6 + i * (h - 12) / 5;
      el('line', { x1: x + 2, y1: yy + 5, x2: x + w - 2, y2: yy - 5, class: 'louvre' }, g);
    }
  }
  function arrowHead(g, x, y, dir, cls) {
    const s = 9;
    const pts = dir === 'r' ? `${x},${y - s} ${x + s * 1.3},${y} ${x},${y + s}`
      : dir === 'l' ? `${x},${y - s} ${x - s * 1.3},${y} ${x},${y + s}`
        : `${x - s},${y} ${x},${y + s * 1.3} ${x + s},${y}`;
    el('polygon', { points: pts, class: cls }, g);
  }

  // ---------------------------------------------------------------- budowa schematu
  // Siatka sekcji (x): A przepustnice | B EF/F1 | C wymiennik W1 | D komora mieszania |
  // E filtry F2/F3 | F chłodnica CC | G wentylator SF / tłumik T2.  Wiersze: wywiew 180–320, nawiew 340–480.
  const X = { A: 154, B: 222, C: 372, D: 606, E: 746, F: 846, G: 1012, H: 1162 };
  const RC = { cx: 489, cy: 330, r: 108 }, MIXX = 676;

  function build(svgEl, cb) {
    svg = svgEl; onSelect = cb || onSelect;
    svg.setAttribute('viewBox', '0 0 1320 752');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Schemat centrali wentylacyjnej NW-1 z obrotowym odzyskiem ciepła, recyrkulacją i chłodnicą wodną');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--comp-stroke)', 'stroke-width': 1.2, opacity: 0.5 }, pat);

    T(svg, 20, 28, 't-title', 'NW-1 · centrala nawiewno-wywiewna z obrotowym odzyskiem ciepła, recyrkulacją i chłodnicą wodną');
    T(svg, 20, 48, 't-note', 'Strefa: open space, 2. piętro · 800 m² · 80 osób · nawiew 9 600 m³/h · wywiew 9 200 m³/h · woda lodowa 7 °C');

    // kanały zewnętrzne
    const ducts = el('g', {}, svg);
    for (const [x, y, w] of [[20, 215, 130], [20, 375, 130], [1166, 215, 134], [1166, 375, 134]]) el('rect', { x, y, width: w, height: 70, class: 'duct' }, ducts);
    louvre(ducts, 20, 209, 16, 82);
    louvre(ducts, 20, 369, 16, 82);
    T(ducts, 22, 206, 't-tag', 'EHA · WYRZUTNIA');
    T(ducts, 22, 366, 't-tag', 'ODA · CZERPNIA');

    // obudowa centrali
    const cas = el('g', {}, svg);
    el('rect', { x: 150, y: 174, width: 1016, height: 312, rx: 8, class: 'casing' }, cas);
    el('rect', { x: 154, y: 180, width: 1008, height: 140, class: 'row' }, cas);
    el('rect', { x: 154, y: 340, width: 1008, height: 140, class: 'row' }, cas);
    el('rect', { x: 154, y: 320, width: 1008, height: 20, class: 'partition' }, cas);
    for (const x of [X.B, X.C, X.D, X.E, X.F, X.G]) el('line', { x1: x, y1: 180, x2: x, y2: 480, class: 'secline' }, cas);
    el('rect', { x: 150, y: 488, width: 1016, height: 8, rx: 2, class: 'base' }, cas);

    // strumienie powietrza
    const sg = el('g', { id: 'streams' }, svg);
    const S = (d, cls, flow) => {
      const glow = el('path', { d, class: 'glow ' + cls }, sg);
      const p = el('path', { d, class: 'stream ' + cls }, sg);
      const st = { el: p, glow, cls, flow, off: 0 };
      R.streams.push(st);
      return st;
    };
    R.sOda1 = S(`M 26 410 H ${RC.cx}`, 's-oda', 'qF');
    R.sOda2 = S(`M ${RC.cx} 410 H ${MIXX}`, 's-oda', 'qF');
    R.sMia = S(`M ${MIXX} 410 H 898`, 's-mia', 'qS');
    R.sSup = S('M 898 410 H 1294', 's-sup', 'qS');
    R.sEta1 = S(`M 1294 250 H ${MIXX}`, 's-eta', 'qE');
    R.sEta2 = S(`M ${MIXX} 250 H ${RC.cx}`, 's-eta', 'qX');
    R.sEha = S(`M ${RC.cx} 250 H 26`, 's-eha', 'qX');
    R.sRca = S(`M ${MIXX} 250 V 410`, 's-rca', 'qR');
    arrowHead(sg, 1296, 410, 'r', 'f-sup');
    arrowHead(sg, 18, 250, 'l', 'f-eha');

    // ---- D2 — przepustnica wyrzutu
    let g = comp('D2', 'Przepustnica powietrza wyrzucanego D2', svg);
    hit(g, 162, 184, 52, 134);
    damper(g, 'D2', 170, 201, 36, 100, 'h');
    actuator(g, 180, 188);
    V(g, 'D2pos', 188, 315, 't-sm', '%', 'middle');

    // ---- D1 — przepustnica czerpni
    g = comp('D1', 'Przepustnica powietrza zewnętrznego D1', svg);
    hit(g, 162, 344, 52, 134);
    damper(g, 'D1', 170, 361, 36, 100, 'h');
    actuator(g, 180, 348);
    V(g, 'D1pos', 188, 475, 't-sm', '%', 'middle');
    manBadge(g, 'fresh', 214, 352);

    // ---- EF — wentylator wywiewny
    g = comp('EF', 'Wentylator wywiewny EF', svg);
    hit(g, 248, 208, 104, 84);
    fan(g, 'EF', 290, 250, 36, 328);
    R.lamps.EFs = el('circle', { class: 'lamp off', cx: 318, cy: 220, r: 5 }, g);
    T(g, 240, 300, 't-tag', 'EF');
    manBadge(g, 'ef', 336, 286);

    // ---- F1 — filtr wstępny
    g = comp('F1', 'Filtr F1 powietrza zewnętrznego', svg);
    hit(g, 288, 344, 48, 134);
    pleatFilter(g, 296, 362, 32, 96);
    T(g, 312, 355, 't-tag', 'F1', 'middle');
    V(g, 'F1dp', 312, 475, 't-sm', 'Pa', 'middle');

    // ---- TE-07 (za wymiennikiem — wyrzut)
    g = el('g', {}, svg);
    sensor(g, 358, 204, 'TE', [214.5, 241]);
    el('rect', { class: 'vbox', x: 374, y: 191, width: 106, height: 25, rx: 5 }, g);
    T(g, 381, 208, 't-tag', 'TE-07');
    V(g, 'TE07', 473, 209, 't-sm', '°C', 'end');

    // ---- W1 — wymiennik obrotowy
    const { cx, cy, r } = RC;
    g = comp('W1', 'Wymiennik obrotowy W1', svg);
    el('circle', { cx, cy, r: r + 6, class: 'hit' }, g);
    el('circle', { cx, cy, r, class: 'cfill' }, g);
    el('path', { d: `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`, class: 'f-eta', opacity: 0.10 }, g);
    el('path', { d: `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy} Z`, class: 'f-oda', opacity: 0.10 }, g);
    R.rotorTint = el('circle', { cx, cy, r: r - 8, fill: 'var(--sup)', opacity: 0 }, g);
    const mat = el('g', {}, g);
    for (let i = 0; i < 36; i++) {
      const a = i * Math.PI / 18, c = Math.cos(a), sn = Math.sin(a), thick = i % 9 === 0;
      el('line', { x1: cx + 15 * c, y1: cy + 15 * sn, x2: cx + (r - 8) * c, y2: cy + (r - 8) * sn, class: thick ? 'cline' : 'thin', 'stroke-width': thick ? 2.2 : 0.8 }, mat);
    }
    R.rotor = { mat, angle: 0, cx, cy };
    for (const rr of [42, 71]) el('circle', { cx, cy, r: rr, class: 'thin' }, g);
    el('circle', { cx, cy, r: r - 8, class: 'cline' }, g);
    el('line', { x1: cx - r, y1: cy, x2: cx + r, y2: cy, stroke: 'var(--casing)', 'stroke-width': 5 }, g);
    el('circle', { cx, cy, r: 12, class: 'cfill' }, g);
    const ar = (deg) => [cx + (r - 8) * Math.cos(deg * Math.PI / 180), cy + (r - 8) * Math.sin(deg * Math.PI / 180)];
    const [a1x, a1y] = ar(-62), [a2x, a2y] = ar(-34);
    el('path', { d: `M ${a1x.toFixed(1)} ${a1y.toFixed(1)} A ${r - 8} ${r - 8} 0 0 1 ${a2x.toFixed(1)} ${a2y.toFixed(1)}`, class: 'cline', 'stroke-width': 2 }, g);
    el('polygon', { points: `${(a2x + 5).toFixed(1)},${(a2y - 7).toFixed(1)} ${(a2x + 3).toFixed(1)},${(a2y + 7).toFixed(1)} ${(a2x - 7).toFixed(1)},${(a2y - 1).toFixed(1)}`, fill: 'var(--comp-stroke)' }, g);
    el('rect', { x: 566, y: 446, width: 24, height: 18, rx: 2, class: 'cfill' }, g);
    el('text', { x: 578, y: 459, 'text-anchor': 'middle', class: 't-tag', style: 'font-size:9px' }, g, 'M');
    el('line', { x1: 572, y1: 446, x2: 552, y2: 421, class: 'cline' }, g);
    T(g, 380, 474, 't-tag', 'W1');
    R.lamps.W1s = el('circle', { class: 'lamp off', cx: 403, cy: 470, r: 5 }, g);
    manBadge(g, 'rotor', 592, 236);

    // ---- D3 — przepustnica recyrkulacji
    g = comp('D3', 'Przepustnica recyrkulacji D3', svg);
    hit(g, 610, 312, 130, 36);
    damper(g, 'D3', MIXX - 40, 321, 80, 18, 'v');
    actuator(g, MIXX + 45, 324);
    V(g, 'D3pos', MIXX - 46, 335, 't-sm', '%', 'end');
    T(g, 614, 312, 't-tag', 'D3');

    // ---- czujniki w sekcji nawiewnej
    g = el('g', {}, svg);
    sensor(g, 632, 452, 'TE', [441.5, 418]);
    sensor(g, 720, 452, 'TE', [441.5, 418]);
    sensor(g, 990, 452, 'TE', [441.5, 418]);

    // ---- F2 — filtr wywiewu
    g = comp('F2', 'Filtr F2 powietrza wywiewanego', svg);
    hit(g, 760, 184, 72, 134);
    bagFilter(g, 768, 202, 56, 96, -1);
    T(g, 796, 196, 't-tag', 'F2', 'middle');
    V(g, 'F2dp', 796, 315, 't-sm', 'Pa', 'middle');
    R.f2dot = el('circle', { cx: 826, cy: 192, r: 5, fill: 'var(--warn)', class: 'blink', visibility: 'hidden' }, g);

    // ---- F3 — filtr dokładny
    g = comp('F3', 'Filtr F3 powietrza nawiewanego', svg);
    hit(g, 760, 344, 72, 134);
    bagFilter(g, 768, 362, 56, 96, 1);
    T(g, 796, 356, 't-tag', 'F3', 'middle');
    V(g, 'F3dp', 796, 475, 't-sm', 'Pa', 'middle');

    // ---- T2 — tłumik
    g = el('g', {}, svg);
    for (let i = 0; i < 4; i++) el('rect', { x: 1030 + i * 32, y: 204, width: 18, height: 92, rx: 2, fill: 'url(#hatch)', stroke: 'var(--comp-stroke)', 'stroke-width': 1.2 }, g);
    T(g, 1087, 196, 't-tag', 'T2 · TŁUMIK', 'middle');

    // ---- CC — chłodnica + eliminator kropel
    g = comp('CC', 'Chłodnica wodna CC', svg);
    hit(g, 858, 344, 112, 134);
    R.coilFill = el('rect', { x: 866, y: 362, width: 64, height: 96, class: 'coilfill', opacity: 0.1 }, g);
    for (let i = 1; i < 13; i++) el('line', { x1: 866 + i * 5, y1: 364, x2: 866 + i * 5, y2: 456, class: 'thin' }, g);
    el('rect', { x: 866, y: 362, width: 64, height: 96, rx: 2, class: 'cline' }, g);
    el('line', { x1: 866, y1: 458, x2: 930, y2: 362, class: 'cline' }, g);
    el('circle', { cx: 918, cy: 444, r: 8, class: 'cfill' }, g);
    el('line', { x1: 913, y1: 444, x2: 923, y2: 444, class: 'cline', 'stroke-width': 2 }, g);
    el('rect', { x: 862, y: 461, width: 72, height: 6, rx: 1, class: 'cfill' }, g);
    for (const xx of [942, 954]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push(`${xx + (i % 2 ? 6 : 0)},${364 + i * 7.6}`);
      el('polyline', { points: pts.join(' '), class: 'cline', 'stroke-width': 1.4 }, g);
    }
    T(g, 898, 356, 't-tag', 'CC', 'middle');
    T(g, 954, 356, 't-tag', 'DE', 'middle');

    // ---- SF — wentylator nawiewny
    g = comp('SF', 'Wentylator nawiewny SF', svg);
    hit(g, 1044, 368, 104, 84);
    fan(g, 'SF', 1087, 410, 36, 1125);
    R.lamps.SFs = el('circle', { class: 'lamp off', cx: 1115, cy: 380, r: 5 }, g);
    T(g, 1040, 462, 't-tag', 'SF');
    manBadge(g, 'sf', 1150, 446);

    // ---- czujniki kanałowe
    g = el('g', {}, svg);
    sensor(g, 78, 468, 'TE', [445, 457.5]);
    sensor(g, 102, 468, 'ME', [445, 457.5]);
    sensor(g, 1190, 196, 'QT', [206.5, 215]);
    sensor(g, 1226, 196, 'TE', [206.5, 215]);
    sensor(g, 1250, 196, 'ME', [206.5, 215]);
    sensor(g, 1284, 196, 'PT', [206.5, 215]);
    sensor(g, 1186, 464, 'SD', [445, 453.5]);
    sensor(g, 1226, 464, 'TE', [445, 453.5]);
    sensor(g, 1250, 464, 'ME', [445, 453.5]);
    sensor(g, 1284, 464, 'PT', [445, 453.5]);

    // ---- instalacja wody lodowej (zawór 3-drogowy mieszający na powrocie)
    g = comp('Y1', 'Zawór trójdrogowy chłodnicy Y1', svg);
    hit(g, 756, 540, 170, 196);
    const pipes = el('g', {}, g);
    const P = (d, cls, key) => {
      el('path', { d, class: 'pipe ' + cls }, pipes);
      const fl = el('path', { d, class: 'flowdash' }, pipes);
      R.pipes.push({ el: fl, key, off: 0 });
    };
    P('M 884 467 V 598', 'pipe-r', 'coil');
    P('M 884 622 V 724', 'pipe-r', 'main');
    P('M 914 724 V 467', 'pipe-s', 'main');
    P('M 914 610 H 896', 'pipe-s', 'bypass');
    el('path', { d: 'M 870 467 V 508', class: 'pipe', stroke: 'var(--cond)', 'stroke-width': 3, opacity: 0.8 }, pipes);
    el('path', { d: 'M 870 514 q -5 8 0 12 q 5 -4 0 -12 z', fill: 'var(--cond)', opacity: 0.85 }, pipes);
    R.valveSym = [
      el('polygon', { points: '876,598 892,598 884,610', class: 'cfill' }, g),
      el('polygon', { points: '876,622 892,622 884,610', class: 'cfill' }, g),
      el('polygon', { points: '896,602 896,618 884,610', class: 'cfill' }, g)
    ];
    el('line', { x1: 884, y1: 610, x2: 866, y2: 610, class: 'cline' }, g);
    el('rect', { x: 848, y: 602, width: 18, height: 16, rx: 2, class: 'cfill' }, g);
    el('text', { x: 857, y: 614, 'text-anchor': 'middle', class: 't-tag', style: 'font-size:9px' }, g, 'M');
    sensor(g, 884, 566, 'TE', null);
    sensor(g, 914, 672, 'TE', null);
    sensor(g, 884, 700, 'TE', null);
    el('rect', { class: 'vbox', x: 762, y: 598, width: 80, height: 42, rx: 6 }, g);
    T(g, 770, 613, 't-tag', 'Y1 · ZAWÓR');
    V(g, 'Y1', 770, 632, 't-val', '%');
    manBadge(g, 'valve', 838, 598);
    T(g, 878, 744, 't-tag', '▼ DO AGREGATU', 'end');
    T(g, 920, 744, 't-tag', '▲ Z AGREGATU WODY LODOWEJ');

    // ---- ramki wartości — pasmo górne
    const bx = el('g', {}, svg);
    box(bx, null, 222, 74, 148, 'Wentylator EF', [['EFq', '', 'm³/h'], ['EFn', '', ''], ['EFp', '', '']], { lamp: 'EF' });
    leader(bx, '290,156 290,214');
    box(bx, null, 402, 74, 174, 'Wymiennik W1', [['W1n', '', ''], ['W1eta', '', ''], ['W1q', '', '']], { lamp: 'W1' });
    leader(bx, `${cx},156 ${cx},222`);
    const st = el('g', {}, bx);
    el('rect', { class: 'panelbox', x: 590, y: 74, width: 568, height: 82, rx: 8 }, st);
    T(st, 604, 100, 't-big', 'NW-1');
    R.lamps.main = el('circle', { class: 'lamp off', cx: 668, cy: 94, r: 6 }, st);
    V(st, 'stMode', 680, 99, 't-ttl', '');
    R.pillDehum = el('g', { visibility: 'hidden' }, st);
    el('rect', { x: 1034, y: 84, width: 112, height: 20, rx: 10, fill: 'none', stroke: 'var(--ok)', 'stroke-width': 1.2 }, R.pillDehum);
    T(R.pillDehum, 1090, 98, 't-tag', 'OSUSZANIE', 'middle').setAttribute('style', 'fill:var(--ok)');
    const lato = el('g', {}, st);
    el('rect', { x: 960, y: 84, width: 66, height: 20, rx: 10, fill: 'none', stroke: 'var(--sup)', 'stroke-width': 1.2 }, lato);
    T(lato, 993, 98, 't-tag', 'LATO', 'middle').setAttribute('style', 'fill:var(--sup)');
    V(st, 'stReg', 604, 124, 't-ttl', '');
    V(st, 'stInfo', 604, 145, 't-note', '');
    box(bx, 'ETA', 1166, 38, 134, 'ETA · wywiew', [['TE06', 'TE-06', '°C'], ['ME06', 'ME-06', '%'], ['QT01', 'QT-01', 'ppm'], ['PT02', 'PT-02', 'Pa'], ['FT02', 'FT-02', 'm³/h']], { panel: true, rh: 17 });

    // ---- pasmo dolne
    box(bx, null, 20, 494, 128, 'ODA · zewn.', [['TE01', 'TE-01', '°C'], ['ME01', 'ME-01', '%'], ['ODAx', 'x', 'g/kg'], ['ODAh', 'h', 'kJ/kg']], { panel: true, rh: 17 });
    box(bx, null, 160, 506, 250, 'Bilans powietrza', [['bF', 'Świeże', ''], ['bR', 'Recyrkulacja', ''], ['bX', 'Wyrzut', 'm³/h'], ['bP', 'Nadciśnienie', 'm³/h']], { rh: 17 });
    mbox(bx, 'TE02', 572, 500, 96, 'TE-02 · ZA W1', '°C');
    leader(bx, '632,463 632,500');
    mbox(bx, 'TE03', 674, 500, 96, 'TE-03 · MIESZ.', '°C');
    leader(bx, '720,463 720,500');
    mbox(bx, 'TE04', 934, 500, 72, 'TE-04', '°C');
    leader(bx, '990,463 990,500');
    box(bx, null, 1012, 500, 150, 'Wentylator SF', [['SFq', '', 'm³/h'], ['SFn', '', ''], ['SFp', '', '']], { lamp: 'SF' });
    leader(bx, '1087,500 1087,446');
    box(bx, 'SUP', 1166, 492, 134, 'SUP · nawiew', [['TE05', 'TE-05', '°C'], ['ME05', 'ME-05', '%'], ['PT01', 'PT-01', 'Pa'], ['FT01', 'FT-01', 'm³/h'], ['SD01', 'SD-01', '']], { panel: true, rh: 17 });
    // woda lodowa
    mbox(bx, 'TE09', 760, 546, 102, 'TE-09 · POWRÓT', '°C');
    leader(bx, '862,566 873,566');
    box(bx, null, 926, 560, 84, 'CC · moc', [['CCq', '', 'kW'], ['CCc', '', 'kg/h'], ['CCw', '', 'm³/h']], { rh: 17 });
    mbox(bx, 'TE08', 926, 652, 84, 'TE-08 · ZAS.', '°C');
    leader(bx, '924,672 928,672');
    mbox(bx, 'TE10', 760, 680, 102, 'TE-10 · DO AGR.', '°C');
    leader(bx, '862,700 873,700');

    // ---- legenda
    const lg = el('g', {}, svg);
    const items = [
      ['s-oda', 'ODA — zewnętrzne'], ['s-mia', 'MIA — mieszanina'], ['s-sup', 'SUP — nawiewane'],
      ['s-eta', 'ETA — wywiewane'], ['s-rca', 'RCA — recyrkulacja'], ['s-eha', 'EHA — wyrzucane']
    ];
    items.forEach(([c, t], i) => {
      const x = 160 + (i % 3) * 168, y = 634 + Math.floor(i / 3) * 24;
      el('line', { x1: x, y1: y, x2: x + 24, y2: y, class: 'legend-line ' + c }, lg);
      T(lg, x + 32, y + 4, 't-lbl', t);
    });
    el('line', { x1: 160, y1: 682, x2: 184, y2: 682, class: 'pipe pipe-s' }, lg);
    T(lg, 192, 686, 't-lbl', 'woda lodowa — zasilanie');
    el('line', { x1: 380, y1: 682, x2: 404, y2: 682, class: 'pipe pipe-r' }, lg);
    T(lg, 412, 686, 't-lbl', 'powrót');
    T(lg, 160, 716, 't-note', 'Kliknij element centrali, aby otworzyć kartę urządzenia (parametry, tryb ręczny).');
  }

  // ---------------------------------------------------------------- formatowanie
  const NB = ' ';
  function f(v, d = 1) {
    if (v == null || !isFinite(v)) return '—';
    let s = Math.abs(v).toFixed(d);
    const [i, dec] = s.split('.');
    const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return (v < 0 && Number(s) !== 0 ? '−' : '') + ii + (dec ? ',' + dec : '');
  }

  // ---------------------------------------------------------------- aktualizacja wartości
  function update(o, m, d, ctl, manual, alarms) {
    const hy = o.hy, run = hy.qS > 50;
    svg.classList.toggle('stopped', !run);

    // strumienie
    const fr = hy.qS > 1 ? hy.qF / hy.qS : 1;
    const rcaOn = hy.qR > 30;
    R.sRca.el.style.opacity = rcaOn ? '' : '0';
    R.sRca.glow.style.opacity = rcaOn ? '' : '0';
    const exOn = hy.qX > 30;
    for (const st of [R.sEta2, R.sEha]) { st.el.style.opacity = exOn || !run ? '' : '0.15'; }
    const mixCls = fr > 0.985 ? 's-oda' : 's-mia';
    if (R.sMia.cur !== mixCls) {
      R.sMia.el.setAttribute('class', 'stream ' + mixCls);
      R.sMia.glow.setAttribute('class', 'glow ' + mixCls);
      R.sMia.cur = mixCls;
    }

    // przepustnice
    const setBl = (id, pos, flow) => {
      for (const b of R.blades[id]) {
        const ang = 90 * (1 - pos) * b.sign;
        b.line.setAttribute('transform', `rotate(${ang.toFixed(1)} ${b.cx} ${b.cy})`);
      }
    };
    setBl('D1', o.act.d); setBl('D2', o.act.d); setBl('D3', o.act.d3);
    setT('D1pos', f(o.act.d * 100, 0)); setT('D2pos', f(o.act.d * 100, 0)); setT('D3pos', f(o.act.d3 * 100, 0));

    // wentylatory
    const fanTxt = (k, fo, q) => {
      setT(k + 'q', f(d(k + 'q', q, 0.004), 0));
      setT(k + 'n', q > 1 ? `${f(fo.n * 100, 0)} % · ${f(fo.hz, 1)} Hz` : 'postój');
      setT(k + 'p', q > 1 ? `${f(d(k + 'P', fo.P, 0.01), 2)} kW · ${f(d(k + 'dp', fo.dp, 0.008), 0)} Pa` : '0,00 kW');
      const on = q > 1;
      R.lamps[k].setAttribute('class', 'lamp ' + (on ? 'on' : 'off'));
      R.lamps[k + 's'].setAttribute('class', 'lamp ' + (on ? 'on' : 'off'));
    };
    fanTxt('SF', hy.sf, hy.qS);
    fanTxt('EF', hy.ef, hy.qX);

    // wymiennik obrotowy
    const rs = o.act.rotor, rpm = rs * 12;
    setT('W1n', rs > 0.001 ? `${f(rs * 100, 0)} % · ${f(rpm, 1)} obr/min` : 'postój');
    setT('W1eta', rs > 0.001 && o.R.etaT > 0 ? `η ${f(o.R.etaT * 100, 0)} % · ηx ${f(o.R.etaX * 100, 0)} %` : 'η — · ηx —');
    const q = o.Qrec;
    setT('W1q', o.cleaning ? 'cykl czyszczący' : (Math.abs(q) < 0.05 ? 'brak odzysku' : (q > 0 ? `odzysk chłodu ${f(d('W1q', q, 0.01), 1)} kW` : `odzysk ciepła ${f(-q, 1)} kW`)));
    R.lamps.W1.setAttribute('class', 'lamp ' + (rs > 0.001 ? 'on' : 'off'));
    R.lamps.W1s.setAttribute('class', 'lamp ' + (rs > 0.001 ? 'on' : 'off'));
    R.rotorTint.setAttribute('fill', q >= 0 ? 'var(--sup)' : 'var(--rca)');
    R.rotorTint.setAttribute('opacity', (Math.min(1, Math.abs(q) / 8) * 0.22).toFixed(3));

    // chłodnica / zawór
    const v = o.act.valve;
    R.coilFill.setAttribute('opacity', (0.06 + 0.42 * v).toFixed(3));
    setT('Y1', f(d('Y1', v * 100, 0.002), 0));
    for (const p of R.valveSym) p.style.fill = v > 0.005 ? `color-mix(in srgb, var(--chws) ${Math.round(25 + 60 * v)}%, var(--comp-fill))` : '';
    setT('CCq', f(d('CCq', o.Qcool, 0.01), 1));
    setT('CCc', f(o.C.cond, 1));
    setT('CCw', f(o.C.flow, 2));

    // pomiary temperatur
    const tv = (k, val, dec = 1) => setT(k, f(d(k, val, 0.05, true), dec));
    tv('TE01', m.TE01); setT('ME01', f(d('ME01', m.ME01, 0.3, true), 0));
    setT('ODAx', f(o.oda.x, 1)); setT('ODAh', f(o.oda.h, 1));
    tv('TE02', m.TE02); tv('TE03', m.TE03); tv('TE04', m.TE04); tv('TE05', m.TE05);
    setT('ME05', f(d('ME05', m.ME05, 0.3, true), 0));
    tv('TE06', m.TE06); setT('ME06', f(d('ME06', m.ME06, 0.3, true), 0));
    tv('TE07', m.TE07); tv('TE08', m.TE08); tv('TE09', m.TE09); tv('TE10', m.TE10);
    setT('QT01', f(d('QT01', m.QT01, 3, true), 0));
    setT('PT01', f(d('PT01', hy.ptSup, 0.015), 0));
    setT('PT02', f(d('PT02', hy.ptEta, 0.015), 0));
    setT('FT01', f(d('FT01', hy.qS, 0.004), 0));
    setT('FT02', f(d('FT02', hy.qE, 0.004), 0));
    setT('SD01', 'norma');

    // filtry
    setT('F1dp', f(d('F1dp', hy.dp.F1, 0.01), 0));
    setT('F3dp', f(d('F3dp', hy.dp.F3, 0.01), 0));
    setT('F2dp', f(d('F2dp', hy.dp.F2, 0.01), 0));
    const f2w = alarms.some((a) => a.code === 'FLT-F2');
    R.f2dot.setAttribute('visibility', f2w ? 'visible' : 'hidden');

    // bilanse
    setT('bF', `${f(hy.qF, 0)} m³/h · ${f(fr * 100, 0)} %`);
    setT('bR', `${f(hy.qR, 0)} m³/h · ${f((1 - fr) * 100, 0)} %`);
    setT('bX', f(hy.qX, 0));
    setT('bP', (hy.qS - hy.qE >= 0 ? '+' : '') + f(hy.qS - hy.qE, 0));
    setT('eC', f(d('eC', o.Qcool, 0.01), 1));
    setT('eR', f(o.Qrec, 1));
    setT('eM', f(o.hy.mR > 0 && o.mode === 'DAY' ? o.Qrecirc : 0, 1));
    setT('eF', f(d('eF', o.fans, 0.01), 2));

    // baner stanu
    const MODE = { OFF: 'POSTÓJ', DAY: 'PRACA', NIGHT: 'CHŁODZENIE NOCNE' };
    const CM = { AUTO: 'AUTO', ON: 'RĘCZNY — PRACA', OFF: 'RĘCZNY — STOP' };
    setT('stMode', `${MODE[o.mode]} · ${CM[ctl.mode]}`);
    R.lamps.main.setAttribute('class', 'lamp ' + (o.mode === 'OFF' ? 'off' : 'on'));
    const REG = {
      CR: 'Sekwencja: odzysk chłodu (W1 100 %) + recyrkulacja · chłodnica',
      FC: o.act.valve > 0.01 ? 'Sekwencja: free cooling (100 % powietrza świeżego) · chłodnica' : 'Sekwencja: free cooling (100 % powietrza świeżego)',
      HR: 'Sekwencja: free cooling + odzysk ciepła (W1 modulowany, bez przechłodzenia nawiewu)',
      NP: 'Sekwencja: przewietrzanie nocne — 100 % powietrza świeżego, W1 stop',
      OFF: 'Sekwencja: centrala zatrzymana — przepustnice zamknięte'
    };
    setT('stReg', REG[o.regime] || '');
    const sched = `Program ${String(ctl.schedOn).padStart(2, '0')}:00–${String(ctl.schedOff).padStart(2, '0')}:00`;
    const extras = [
      `T zad. pom. ${f(o.spC, 2)} °C${o.comp > 0.01 ? ` (komp. +${f(o.comp, 2)} K)` : ''}`,
      o.mode === 'DAY' ? `T zad. naw. ${f(o.supSP, 1)} °C` : null
    ].filter(Boolean);
    setT('stInfo', [sched, ...extras].join(' · '));
    R.pillDehum.setAttribute('visibility', o.dehumOn ? 'visible' : 'hidden');

    // ostrzeżenia na ramkach
    R.warn.SUP.classList.toggle('warn', o.sup.t < 14.5 && run);

    // tryb ręczny
    for (const k in R.man) R.man[k].setAttribute('visibility', manual[k] != null ? 'visible' : 'hidden');
  }

  // ---------------------------------------------------------------- animacje (czas rzeczywisty)
  function animate(dt, o) {
    if (!o) return;
    const hy = o.hy;
    for (const s of R.streams) {
      const q = hy[s.flow] || 0;
      if (q < 20) continue;
      const v = 18 + 70 * Math.min(1.3, q / 9600);
      s.off = (s.off - v * dt) % 27;
      s.el.style.strokeDashoffset = s.off.toFixed(2);
    }
    for (const id of ['SF', 'EF']) {
      const F = R.fans[id], n = id === 'SF' ? hy.sf.n : hy.ef.n;
      if (n <= 0.001) continue;
      F.angle = (F.angle + n * 540 * dt) % 360;
      F.imp.setAttribute('transform', `rotate(${(id === 'EF' ? -F.angle : F.angle).toFixed(1)} ${F.cx} ${F.cy})`);
    }
    const rpm = o.act.rotor * 12;
    if (rpm > 0.01) {
      R.rotor.angle = (R.rotor.angle + rpm * 6 * dt) % 360;
      R.rotor.mat.setAttribute('transform', `rotate(${R.rotor.angle.toFixed(2)} ${R.rotor.cx} ${R.rotor.cy})`);
    }
    const phi = o.C.phi;
    for (const p of R.pipes) {
      const k = p.key === 'coil' ? phi : p.key === 'bypass' ? (1 - phi) : 1;
      if (k < 0.01 || o.mode === 'OFF' && phi < 0.01) { p.el.style.opacity = '0'; continue; }
      p.el.style.opacity = '';
      p.off = (p.off - (10 + 30 * k) * dt) % 14;
      p.el.style.strokeDashoffset = p.off.toFixed(2);
    }
  }

  root.Schematic = { build, update, animate, fmt: f };
})(window);
