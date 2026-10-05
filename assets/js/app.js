/*
 * BMS · NW-1 — logika interfejsu: pętla symulacji, widoki, panel boczny,
 * nastawy, karty urządzeń (faceplate), alarmy, harmonogram.
 */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const f = Schematic.fmt;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAYS_S = ['nd.', 'pn.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
  const DAYS_L = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  const CFG = AHU.CFG;

  // ---------------------------------------------------------------- szum pomiarowy (wyświetlanie)
  const J = {};
  const jit = (k) => (J[k] != null ? J[k] : (J[k] = Math.random() * 2 - 1));
  function stepJitter() { for (const k in J) J[k] = clamp(J[k] * 0.55 + (Math.random() * 2 - 1) * 0.6, -1, 1); }
  function disp(k, v, amp, abs) {
    if (v == null || !isFinite(v)) return v;
    return abs ? v + amp * jit(k) : v * (1 + amp * jit(k));
  }

  // ---------------------------------------------------------------- czas
  const pad = (n) => String(n).padStart(2, '0');
  function hhmm(t, sec) {
    const s = ((Math.floor(t) % 86400) + 86400) % 86400;
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}${sec ? ':' + pad(s % 60) : ''}`;
  }
  function dateStr(t, long) {
    const d = AHU.dateOf(t);
    const s = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
    return long ? `${DAYS_L[d.getUTCDay()]}, ${s}` : `${DAYS_S[d.getUTCDay()]}, ${s}`;
  }

  // ---------------------------------------------------------------- symulacja
  const sim = AHU.createSim({ start: 14.5 * 3600 });
  let speed = 1;
  const alarmSince = {};

  // ---------------------------------------------------------------- motyw
  $('#theme-btn').addEventListener('click', () => {
    const r = document.documentElement;
    r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('bms-theme', r.dataset.theme); } catch (e) { /* brak dostępu */ }
    redrawCharts(true);
  });

  // ---------------------------------------------------------------- widoki
  let view = 'schemat';
  function show(v) {
    view = v;
    for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.view === v));
    for (const s of $$('.view')) s.hidden = s.id !== 'view-' + v;
    try { localStorage.setItem('bms-view', v); } catch (e) { /* brak dostępu */ }
    refresh(true);
  }
  for (const b of $$('.tabs button')) b.addEventListener('click', () => show(b.dataset.view));

  // ---------------------------------------------------------------- pasek symulacji
  for (const b of $$('#speed-seg button')) {
    b.addEventListener('click', () => {
      speed = Number(b.dataset.speed);
      for (const x of $$('#speed-seg button')) x.classList.toggle('on', x === b);
    });
  }
  for (const b of $$('#jump-seg button')) {
    b.addEventListener('click', () => {
      const [h, m] = b.dataset.t.split(':').map(Number);
      const target = AHU.dayIndex(sim.t) * 86400 + h * 3600 + m * 60;
      document.body.style.cursor = 'progress';
      setTimeout(() => { sim.jumpTo(target); document.body.style.cursor = ''; refresh(true); }, 10);
    });
  }

  // ---------------------------------------------------------------- schemat
  Schematic.build($('#ahu'), (id) => openFace(id));

  // ---------------------------------------------------------------- nastawy
  const SP = [
    { k: 'spCool', l: 'Temp. pomieszczenia — chłodzenie', u: '°C', step: 0.5, min: 21, max: 27, d: 1 },
    { k: 'summerComp', l: 'Kompensacja letnia', s: '+0,2 K/K powyżej 26 °C, maks. +1,5 K', type: 'bool' },
    { k: 'supMin', l: 'Temp. nawiewu — minimum', u: '°C', step: 0.5, min: 14, max: 20, d: 1 },
    { k: 'supMax', l: 'Temp. nawiewu — maksimum', u: '°C', step: 0.5, min: 18, max: 26, d: 1 },
    { k: 'dehum', l: 'Osuszanie', s: 'ogranicza T nawiewu przy wysokim x', type: 'bool' },
    { k: 'xMax', l: 'Wilgotność bezwzgl. wywiewu — maks.', u: 'g/kg', step: 0.1, min: 9, max: 13, d: 1 },
    { k: 'co2Sp', l: 'Stężenie CO₂ — maksimum', u: 'ppm', step: 50, min: 600, max: 1400, d: 0 },
    { k: 'freshMin', l: 'Minimalny udział powietrza świeżego', u: '%', step: 5, min: 20, max: 100, d: 0 },
    { k: 'qSup', l: 'Wydatek nawiewu', u: 'm³/h', step: 200, min: 6000, max: 11600, d: 0 },
    { k: 'qEta', l: 'Wydatek wywiewu', u: 'm³/h', step: 200, min: 5600, max: 11200, d: 0 },
    { k: 'nightPurge', l: 'Chłodzenie nocne', s: '22:00–05:30, gdy t zewn. < t pom. − 3 K', type: 'bool' }
  ];
  const spList = $('#sp-list');
  for (const p of SP) {
    const row = document.createElement('div');
    row.className = 'sp-row';
    row.innerHTML = `<div class="lbl">${esc(p.l)}${p.s ? `<small>${esc(p.s)}</small>` : ''}</div>` + (p.type === 'bool'
      ? `<button class="toggle" role="switch" aria-label="${esc(p.l)}" data-k="${p.k}"></button>`
      : `<div class="stepper"><button aria-label="Zmniejsz" data-k="${p.k}" data-dir="-1">−</button><output data-k="${p.k}"></output><button aria-label="Zwiększ" data-k="${p.k}" data-dir="1">+</button></div>`);
    spList.appendChild(row);
  }
  spList.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const p = SP.find((x) => x.k === b.dataset.k);
    if (!p) return;
    if (p.type === 'bool') {
      const v = !sim.ctl[p.k];
      sim.setCtl(p.k, v, p.l, v ? 'załączone' : 'wyłączone');
    } else {
      let v = Math.round((sim.ctl[p.k] + p.step * Number(b.dataset.dir)) / p.step) * p.step;
      v = clamp(Number(v.toFixed(3)), p.min, p.max);
      if (p.k === 'supMin' && v > sim.ctl.supNeutral - 0.5) v = sim.ctl.supNeutral - 0.5;
      if (p.k === 'supMax' && v < sim.ctl.supNeutral + 0.5) v = sim.ctl.supNeutral + 0.5;
      if (v !== sim.ctl[p.k]) sim.setCtl(p.k, v, p.l, `${f(v, p.d)} ${p.u}`);
    }
    renderSP(); refresh(true);
  });
  $('#sp-reset').addEventListener('click', () => {
    for (const p of SP) sim.ctl[p.k] = AHU.DEFAULTS[p.k];
    sim.log('info', 'Operator: przywrócono nastawy domyślne');
    renderSP(); refresh(true);
  });
  function renderSP() {
    for (const p of SP) {
      if (p.type === 'bool') $(`.toggle[data-k="${p.k}"]`).setAttribute('aria-checked', String(!!sim.ctl[p.k]));
      else $(`output[data-k="${p.k}"]`).textContent = `${f(sim.ctl[p.k], p.d)} ${p.u}`;
    }
  }
  renderSP();

  // tryb pracy centrali
  for (const b of $$('#modes button')) {
    b.addEventListener('click', () => {
      const v = b.dataset.mode;
      if (v === sim.ctl.mode) return;
      const TXT = { AUTO: 'AUTO (harmonogram)', ON: 'RĘCZNY — PRACA', OFF: 'RĘCZNY — STOP' };
      sim.setCtl('mode', v, 'Tryb pracy centrali', TXT[v]);
      refresh(true);
    });
  }

  // ---------------------------------------------------------------- karty urządzeń
  const fp = $('#fp');
  let fpId = null;
  $('#fp-close').addEventListener('click', () => fp.close());
  fp.addEventListener('close', () => { fpId = null; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fp.open) fp.close(); });

  const kpi = (k, label, sub) => `<div class="kpi"><div class="k">${label}</div><div class="v" data-v="${k}">—</div>${sub ? `<div class="s" data-v="${k}_s">${sub}</div>` : ''}</div>`;
  const filt = (k) => {
    const F = CFG.ahu.filters[k];
    return {
      title: `Filtr ${k} — ${F.cls}`, tag: k,
      body: `<div class="fp-grid">${kpi('dp', 'Spadek ciśnienia (aktualny)')}${kpi('dpn', 'Δp przeliczone na wydatek nominalny')}${kpi('use', 'Zużycie (Δp pocz. → końc.)')}${kpi('q', 'Przepływ przez filtr')}</div>
        <div class="fp-sec"><h4>Dane filtra</h4><dl class="kv"><dt>Klasa (ISO 16890)</dt><dd>${F.cls}</dd><dt>Δp początkowe / końcowe</dt><dd>${F.dpInit} / ${F.dpFinal} Pa</dd><dt>Próg ostrzeżenia</dt><dd>80 % zużycia</dd><dt>Ostatnia wymiana</dt><dd>${F.changed}</dd><dt>Status</dt><dd data-v="st">—</dd></dl></div>
        <p class="fp-desc">Spadek ciśnienia mierzony przetwornikiem różnicy ciśnień (PDT). Zużycie liczone dla Δp sprowadzonego do wydatku nominalnego (Δp ~ V̇^1,6), dzięki czemu ostrzeżenie nie zależy od chwilowego wydatku.</p>`,
      values(o) {
        const hy = o.hy, qq = k === 'F1' ? hy.qF : k === 'F3' ? hy.qS : hy.qE;
        const use = (F.dpNom - F.dpInit) / (F.dpFinal - F.dpInit);
        return {
          dp: `${f(hy.dp[k], 0)}<small>Pa</small>`, dpn: `${f(F.dpNom, 0)}<small>Pa</small>`,
          use: `${f(use * 100, 0)}<small>%</small>`, q: `${f(qq, 0)}<small>m³/h</small>`,
          st: use >= 0.8 ? '<span class="pill warm">ostrzeżenie — zaplanować wymianę</span>' : '<span class="pill on">OK</span>'
        };
      }
    };
  };
  const fanFace = (id) => {
    const sup = id === 'SF';
    return {
      title: sup ? 'Wentylator nawiewny SF' : 'Wentylator wywiewny EF', tag: id,
      body: `<div class="fp-grid">${kpi('q', 'Wydatek', '')}${kpi('n', 'Wysterowanie / częstotliwość')}${kpi('dp', 'Spręż całkowity')}${kpi('p', 'Moc elektryczna')}${kpi('sfp', 'SFP (PN-EN 16798-3)')}${kpi('eta', 'Sprawność układu')}</div>
        <div class="fp-sec"><h4>Sterowanie</h4>${ctrl(id === 'SF' ? 'sf' : 'ef', 'Wydatek w trybie ręcznym (% zadanego)', 30, 110)}</div>
        <div class="fp-sec"><h4>Informacje</h4><dl class="kv"><dt>Typ</dt><dd>EC plug-fan, pomiar wydatku na dyszy wlotowej</dd><dt>Regulacja</dt><dd>${sup ? 'stały wydatek (zadany nawiew)' : 'nadążna — wywiew z pomieszczeń minus recyrkulacja'}</dd><dt>Godziny pracy</dt><dd>${f(CFG.ahu.runHours[id], 0)} h</dd><dt>Przyrost temp. w wentylatorze</dt><dd data-v="dT">—</dd></dl></div>
        <p class="fp-desc">${sup ? 'Wentylator nawiewny zasysa też powietrze recyrkulacyjne przez sieć wywiewną, stąd wyższy spręż w trybie recyrkulacji. Ciepło silnika trafia do strumienia nawiewu (uwzględnione w doborze temperatury za chłodnicą).' : 'Wentylator wywiewny tłoczy przez wymiennik tylko część powietrza wywiewanego (wyrzut). Pozostała część wraca przez przepustnicę recyrkulacji D3.'}</p>`,
      values(o) {
        const hy = o.hy, F = sup ? hy.sf : hy.ef, q = sup ? hy.qS : hy.qX;
        return {
          q: `${f(q, 0)}<small>m³/h</small>`, q_s: sup ? `zadany ${f(sim.ctl.qSup, 0)} m³/h` : `wywiew z pom. ${f(hy.qE, 0)} m³/h`,
          n: q > 1 ? `${f(F.n * 100, 0)}<small>% · ${f(F.hz, 1)} Hz</small>` : 'postój',
          dp: `${f(F.dp, 0)}<small>Pa</small>`, p: `${f(F.P, 2)}<small>kW</small>`,
          sfp: `${f(sup ? o.sfpS : o.sfpE, 2)}<small>kW/(m³/s)</small>`, eta: `${f(F.eta * 100, 0)}<small>%</small>`,
          dT: sup ? `${f(o.dTf, 2)} K` : `${f(o.eha.t - o.exr.t, 2)} K (do wyrzutu)`
        };
      }
    };
  };
  function ctrl(key, label, min, max) {
    return `<div class="fp-ctrl" data-man="${key}"><div class="seg"><button data-a="auto">AUTO</button><button data-a="man">RĘCZNY</button></div>
      <input type="range" min="${min}" max="${max}" step="1" aria-label="${esc(label)}"><output>—</output>
      <div style="width:100%;font-size:12px;color:var(--text-3)">${esc(label)}</div></div>`;
  }
  const FACES = {
    SF: fanFace('SF'), EF: fanFace('EF'),
    F1: filt('F1'), F2: filt('F2'), F3: filt('F3'),
    W1: {
      title: 'Wymiennik obrotowy W1 (sorpcyjny)', tag: 'W1',
      body: `<div class="fp-grid">${kpi('n', 'Prędkość obrotowa')}${kpi('mode', 'Tryb pracy')}${kpi('eta', 'Sprawność temperaturowa η<sub>t</sub>')}${kpi('etax', 'Sprawność wilgotnościowa η<sub>x</sub>')}${kpi('q', 'Moc odzysku (całkowita)', '')}${kpi('dt', 'Zmiana temp. pow. świeżego')}</div>
        <div class="fp-sec"><h4>Sterowanie</h4>${ctrl('rotor', 'Prędkość wirnika w trybie ręcznym (%)', 0, 100)}</div>
        <div class="fp-sec"><h4>Informacje</h4><dl class="kv"><dt>Wirnik</dt><dd>sorpcyjny Ø${CFG.ahu.rotor.dia} mm, napęd z falownikiem</dd><dt>Prędkość maks.</dt><dd>${CFG.ahu.rotor.rpmMax} obr/min</dd><dt>Przepływ: świeże / wyrzut</dt><dd data-v="flows">—</dd><dt>Godziny pracy</dt><dd>${f(CFG.ahu.runHours.W1, 0)} h</dd><dt>Cykl czyszczący</dt><dd>co 30 min przez 20 s podczas postoju</dd></dl></div>
        <p class="fp-desc">Latem, gdy powietrze zewnętrzne jest cieplejsze od wywiewanego, wirnik pracuje z prędkością maksymalną (odzysk chłodu) i schładza oraz osusza powietrze świeże. Przy chłodnym powietrzu zewnętrznym zatrzymuje się (free cooling). Rano może odzyskiwać ciepło, jeżeli nawiew byłby zbyt zimny.</p>`,
      values(o) {
        const r = o.act.rotor, q = o.Qrec;
        return {
          n: r > 0.001 ? `${f(r * 100, 0)}<small>% · ${f(r * 12, 1)} obr/min</small>` : 'postój',
          mode: o.cleaning ? 'czyszczenie' : r < 0.001 ? 'postój' : q >= 0 ? 'odzysk chłodu' : 'odzysk ciepła',
          eta: `${f(o.R.etaT * 100, 0)}<small>%</small>`, etax: `${f(o.R.etaX * 100, 0)}<small>%</small>`,
          q: `${f(Math.abs(q), 1)}<small>kW</small>`, q_s: `jawna ${f(Math.abs(o.QrecS), 1)} kW`,
          dt: `${f(o.rot.t - o.oda.t, 1)}<small>K</small>`,
          flows: `${f(o.hy.qF, 0)} / ${f(o.hy.qX, 0)} m³/h`
        };
      }
    },
    CC: null, Y1: null,
    MIX: {
      title: 'Przepustnice mieszania D1 / D2 / D3', tag: 'D1–D3',
      body: `<div class="fp-grid">${kpi('d1', 'D1 czerpnia = D2 wyrzut')}${kpi('d3', 'D3 recyrkulacja')}${kpi('fr', 'Udział powietrza świeżego', '')}${kpi('co2', 'CO₂ w wywiewie (QT-01)', '')}</div>
        <div class="fp-sec"><h4>Sterowanie</h4>${ctrl('fresh', 'Udział powietrza świeżego w trybie ręcznym (%)', 0, 100)}</div>
        <div class="fp-sec"><h4>Przepływy</h4><dl class="kv"><dt>Powietrze świeże (ODA)</dt><dd data-v="qf">—</dd><dt>Recyrkulacja (RCA)</dt><dd data-v="qr">—</dd><dt>Wyrzut (EHA)</dt><dd data-v="qx">—</dd><dt>Minimalny udział świeżego</dt><dd data-v="fmin">—</dd><dt>Ciśnienie w komorze mieszania</dt><dd data-v="pm">—</dd></dl></div>
        <p class="fp-desc">Przepustnice D1 i D2 pracują razem, D3 przeciwsobnie. Przy odzysku chłodu utrzymywany jest minimalny udział powietrza świeżego (higiena, wymagania PN-EN 16798-1), korygowany regulatorem PI stężenia CO₂. Przy free coolingu centrala pracuje na 100 % powietrza zewnętrznego.</p>`,
      values(o) {
        const hy = o.hy, fr = hy.qS > 1 ? hy.qF / hy.qS : 0;
        return {
          d1: `${f(o.act.d * 100, 0)}<small>%</small>`, d3: `${f(o.act.d3 * 100, 0)}<small>%</small>`,
          fr: `${f(fr * 100, 0)}<small>%</small>`, fr_s: `${f(hy.qF, 0)} m³/h`,
          co2: `${f(o.co2, 0)}<small>ppm</small>`, co2_s: `zadana ≤ ${f(sim.ctl.co2Sp, 0)} ppm`,
          qf: `${f(hy.qF, 0)} m³/h`, qr: `${f(hy.qR, 0)} m³/h`, qx: `${f(hy.qX, 0)} m³/h`,
          fmin: `${f(sim.ctl.freshMin, 0)} %`, pm: `${f(hy.pMix, 0)} Pa`
        };
      }
    }
  };
  FACES.CC = FACES.Y1 = {
    title: 'Chłodnica wodna CC + zawór Y1', tag: 'CC',
    body: `<div class="fp-grid">${kpi('y', 'Zawór Y1 (3-drogowy)', '')}${kpi('q', 'Moc chłodnicza całkowita', '')}${kpi('tw', 'Woda: zasilanie / powrót')}${kpi('cond', 'Wykraplanie (skropliny)')}${kpi('air', 'Powietrze: przed → za')}${kpi('rh', 'Wilgotność za chłodnicą')}</div>
      <div class="fp-sec"><h4>Sterowanie</h4>${ctrl('valve', 'Otwarcie zaworu w trybie ręcznym (%)', 0, 100)}</div>
      <div class="fp-sec"><h4>Parametry procesu</h4><dl class="kv"><dt>Przepływ wody przez wężownicę</dt><dd data-v="flow">—</dd><dt>Powrót do agregatu (po zmieszaniu)</dt><dd data-v="ret">—</dd><dt>Efektywna temp. powierzchni (ADP)</dt><dd data-v="adp">—</dd><dt>Współczynnik obejścia BF</dt><dd data-v="bf">—</dd><dt>Współczynnik ciepła jawnego SHR</dt><dd data-v="shr">—</dd><dt>Spadek ciśnienia (mokra)</dt><dd data-v="dp">—</dd></dl></div>
      <p class="fp-desc">Chłodnica zasilana wodą lodową 7 °C, moc nominalna ok. ${CFG.ahu.coil.qNom} kW (26 °C / 11,2 g/kg). Zawór trójdrogowy mieszający na powrocie, charakterystyka stałoprocentowa. Gdy temperatura efektywnej powierzchni jest niższa od punktu rosy powietrza, część mocy idzie na osuszanie (moc utajona).</p>`,
    values(o) {
      const C = o.C;
      return {
        y: `${f(o.act.valve * 100, 0)}<small>%</small>`, y_s: `przepływ ${f(C.phi * 100, 0)} % nominalnego`,
        q: `${f(C.Q, 1)}<small>kW</small>`, q_s: `jawna ${f(C.Qs, 1)} · utajona ${f(Math.max(0, C.Ql), 1)} kW`,
        tw: `${f(C.twIn, 1)} / ${f(C.twOut, 1)}<small>°C</small>`,
        cond: `${f(C.cond, 1)}<small>kg/h</small>`,
        air: `${f(o.mix.t, 1)} → ${f(o.cc.t, 1)}<small>°C</small>`,
        rh: `${f(o.cc.rh, 0)}<small>%</small>`,
        flow: `${f(C.flow, 2)} m³/h`, ret: `${f(o.twRet, 1)} °C`,
        adp: C.adp != null && C.Q > 0.1 ? `${f(C.adp, 1)} °C` : '—', bf: C.bf != null ? f(C.bf, 3) : '—',
        shr: C.Q > 0.1 ? f(C.Qs / C.Q, 2) : '—', dp: `${f(o.hy.dp.CC, 0)} Pa`
      };
    }
  };
  FACES.D1 = FACES.D2 = FACES.D3 = FACES.MIX;

  function openFace(id) {
    const F = FACES[id];
    if (!F) return;
    fpId = id;
    $('#fp-title').textContent = F.title;
    $('#fp-tag').textContent = F.tag;
    $('#fp-body').innerHTML = F.body;
    const c = $('#fp-body .fp-ctrl');
    if (c) {
      const key = c.dataset.man, range = $('input', c), out = $('output', c);
      const sync = () => {
        const man = sim.manual[key] != null;
        $$('.seg button', c).forEach((b) => b.classList.toggle('on', (b.dataset.a === 'man') === man));
        $$('.seg button', c).forEach((b) => b.classList.toggle('man', b.dataset.a === 'man'));
        range.disabled = !man;
        const cur = man ? sim.manual[key] : currentAuto(key);
        if (document.activeElement !== range) range.value = Math.round(cur);
        out.textContent = `${Math.round(Number(range.value))} %`;
      };
      c.sync = sync;
      $$('.seg button', c).forEach((b) => b.addEventListener('click', () => {
        const LBL = { valve: 'zawór chłodnicy Y1', rotor: 'wymiennik W1', fresh: 'przepustnice mieszania', sf: 'wentylator nawiewny SF', ef: 'wentylator wywiewny EF' };
        if (b.dataset.a === 'man' && sim.manual[key] == null) sim.setManual(key, Math.round(currentAuto(key)), LBL[key]);
        if (b.dataset.a === 'auto' && sim.manual[key] != null) sim.setManual(key, null, LBL[key]);
        sync(); refresh(true);
      }));
      range.addEventListener('input', () => { if (sim.manual[key] != null) { sim.manual[key] = Number(range.value); out.textContent = `${range.value} %`; } });
      range.addEventListener('change', () => { if (sim.manual[key] != null) sim.log('man', `Operator: nastawa ręczna ${key} = ${range.value} %`); });
      sync();
    }
    updateFace();
    if (!fp.open) fp.show();
    $('#fp-close').focus({ preventScroll: true });
  }
  function currentAuto(key) {
    const o = sim.out;
    return { valve: o.act.valve * 100, rotor: o.act.rotor * 100, fresh: (o.hy.qS > 1 ? o.hy.qF / o.hy.qS : o.act.d) * 100, sf: o.act.sf * 100, ef: o.act.ef * 100 }[key];
  }
  function updateFace() {
    if (!fpId || !fp.open) return;
    const vals = FACES[fpId].values(sim.out);
    for (const e of $$('#fp-body [data-v]')) {
      const v = vals[e.dataset.v];
      if (v != null && e.innerHTML !== v) e.innerHTML = v;
    }
    const c = $('#fp-body .fp-ctrl');
    if (c && c.sync) c.sync();
  }

  // ---------------------------------------------------------------- odświeżanie panelu bocznego
  const REG_FULL = {
    CR: 'Odzysk chłodu + recyrkulacja', FC: 'Free cooling — 100 % powietrza świeżego', HR: 'Free cooling + odzysk ciepła',
    NP: 'Przewietrzanie nocne', OFF: 'Centrala zatrzymana'
  };
  let lastEvKey = '';
  function refreshSide(o) {
    const s = sim.state;
    // stan
    const lamp = $('#st-lamp');
    lamp.className = 'status-lamp' + (o.mode === 'OFF' ? ' off' : o.mode === 'NIGHT' ? ' night' : '');
    $('#st-title').textContent = AHU.MODE_TXT[o.mode];
    $('#st-sub').textContent = `${REG_FULL[o.regime]}${o.mode === 'DAY' ? ` · od ${hhmm(s.regimeT0)}` : ''}`;
    for (const b of $$('#modes button')) b.classList.toggle('on', b.dataset.mode === sim.ctl.mode);
    const work = AHU.isWorkday(o.t);
    $('#kv-sched').textContent = work ? `${pad(sim.ctl.schedOn)}:00–${pad(sim.ctl.schedOff)}:00 (dzień roboczy)` : 'weekend — postój';
    $('#kv-spc').textContent = o.comp > 0.005 ? `${f(sim.ctl.spCool, 1)} + ${f(o.comp, 2)} K = ${f(o.spC, 2)} °C` : `${f(sim.ctl.spCool, 1)} °C`;
    $('#kv-sps').textContent = o.mode === 'DAY' ? `${f(o.supSP, 1)} °C` : '—';
    $('#kv-dehum').innerHTML = !sim.ctl.dehum ? '<span class="pill">wyłączone</span>'
      : o.dehumOn ? `<span class="pill on">aktywne (−${f(o.dehumDelta, 1)} K)</span>` : '<span class="pill">czuwanie</span>';
    $('#kv-room').textContent = `${f(o.room.t, 1)} °C · ${f(o.room.rh, 0)} % · ${f(o.co2, 0)} ppm`;
    $('#kv-occ').textContent = `${f(o.Gn.N, 0)} os. · zyski ${f(o.Gn.conv + o.Gn.rad, 1)} kW`;

    // KPI
    const C = o.C, hy = o.hy;
    const set = (id, html) => { const e = $(id); if (e.innerHTML !== html) e.innerHTML = html; };
    set('#k-cool', `${f(disp('kc', o.Qcool, 0.008), 1)}<small>kW</small>`);
    set('#k-cool-s', `jawna ${f(C.Qs, 1)} · utaj. ${f(Math.max(0, C.Ql), 1)} kW`);
    const tot = Math.max(0.01, C.Qs + Math.max(0, C.Ql));
    $('#k-cool-b1').style.width = `${(C.Qs / tot * 100).toFixed(1)}%`;
    $('#k-cool-b2').style.width = `${(Math.max(0, C.Ql) / tot * 100).toFixed(1)}%`;
    set('#k-rec', `${f(Math.abs(o.Qrec), 1)}<small>kW</small>`);
    set('#k-rec-s', o.act.rotor < 0.001 ? 'wirnik zatrzymany' : `${o.Qrec >= 0 ? 'chłód' : 'ciepło'} · η ${f(o.R.etaT * 100, 0)} %`);
    const qrc = o.mode === 'DAY' && hy.mR > 0 ? Math.max(0, o.Qrecirc) : 0;
    set('#k-rca', `${f(qrc, 1)}<small>kW</small>`);
    set('#k-rca-s', hy.qS > 1 ? `${f(hy.qR / hy.qS * 100, 0)} % powietrza (RCA)` : '—');
    set('#k-fan', `${f(disp('kf', o.fans, 0.008), 2)}<small>kW</small>`);
    set('#k-fan-s', o.sfp > 0 ? `SFP ${f(o.sfp, 2)} kW/(m³/s)` : 'postój');
    const hO = o.oda.h, red = hy.qS > 1 && C.Q > 0.5 ? clamp((hO - o.mix.h) / (hO - o.cc.h), 0, 1) : 0;
    set('#k-red', `${f(red * 100, 0)}<small>%</small>`);
    set('#k-red-s', 'wzgl. 100 % pow. świeżego');
    set('#k-cond', `${f(C.cond, 1)}<small>kg/h</small>`);
    set('#k-cond-s', `ADP ${C.adp != null && C.Q > 0.1 ? f(C.adp, 1) + ' °C' : '—'}`);
    const E = s.E;
    set('#d-cool', `${f(E.cool, 0)} kWh`); set('#d-rec', `${f(E.recCool, 0)} kWh`);
    set('#d-rca', `${f(E.recirc, 0)} kWh`); set('#d-fan', `${f(E.fans, 0)} kWh`);
    set('#d-cond', `${f(E.condensate, 0)} kg`);

    // alarmy
    const act = s.alarms;
    for (const a of act) if (!alarmSince[a.code]) alarmSince[a.code] = sim.t;
    for (const k in alarmSince) if (!act.some((a) => a.code === k)) delete alarmSince[k];
    const warnN = act.filter((a) => a.lvl === 'warn' || a.lvl === 'alarm').length;
    const badge = $('#alarm-badge');
    badge.textContent = String(act.length);
    badge.classList.toggle('zero', act.length === 0);
    badge.style.background = warnN ? '' : (act.length ? 'var(--man)' : '');
    const icon = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.5 15 14H1L8 1.5Zm0 4.2c-.4 0-.7.3-.7.7v3.4c0 .4.3.7.7.7s.7-.3.7-.7V6.4c0-.4-.3-.7-.7-.7Zm0 6a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z"/></svg>';
    const ah = act.length ? act.map((a) => `<div class="act-alarm ${a.lvl}">${icon}<span>${esc(a.text)}</span></div>`).join('') : '<div class="empty">Brak aktywnych alarmów.</div>';
    set('#act-alarms', ah);
    const evKey = s.events.length + ':' + (s.events[0] ? s.events[0].t : 0);
    if (evKey !== lastEvKey) {
      lastEvKey = evKey;
      $('#ev-list').innerHTML = s.events.slice(0, 14).map((e) => `<li><time>${hhmm(e.t)}</time><i class="ev-dot ${e.lvl}"></i><span>${esc(e.text)}</span></li>`).join('');
    }
  }

  // ---------------------------------------------------------------- widok: wykres h-x
  function hxData(o) {
    const run = o.hy.qS > 50, rot = o.act.rotor > 0.005 && run, rec = o.hy.qR > 50 && run, coilOn = o.C.Q > 0.3 && run;
    const pts = [
      { id: 'oda', n: 1, short: 'ODA', name: 'Zewnętrzne (TE-01)', s: o.oda, color: '--oda', q: o.hy.qF },
      { id: 'rot', n: 2, short: 'za W1', name: 'Za wymiennikiem W1 (TE-02)', s: o.rot, color: '--accent', q: o.hy.qF, hide: !rot },
      { id: 'mix', n: 3, short: 'MIX', name: 'Mieszanina (TE-03)', s: o.mix, color: '--mia', q: o.hy.qS, hide: !rec, dy: 9 },
      { id: 'cc', n: 4, short: 'za CC', name: 'Za chłodnicą (TE-04)', s: o.cc, color: '--chwr', q: o.hy.qS, hide: !coilOn, labelLeft: true },
      { id: 'sup', n: 5, short: 'SUP', name: 'Nawiew (TE-05)', s: o.sup, color: '--sup', q: o.hy.qS, hide: !run, labelLeft: true },
      { id: 'eta', n: 6, short: 'ETA = RCA', name: 'Wywiew = recyrkulacja (TE-06)', s: o.eta, color: '--eta', q: o.hy.qE, labelLeft: true },
      { id: 'eha', n: 7, short: 'EHA', name: 'Wyrzut (za EF)', s: o.eha, color: '--eha', q: o.hy.qX, hide: !rot, labelLeft: true, dy: -6 },
      { id: 'adp', n: '', short: 'ADP', name: 'Efektywna temp. powierzchni chłodnicy (ADP)', s: o.C.adp != null ? { t: o.C.adp, x: Psy.xSat(o.C.adp), rh: 100, h: Psy.h(o.C.adp, Psy.xSat(o.C.adp)), td: o.C.adp } : null, color: '--text-3', small: true, hide: !coilOn || !o.C.wet, dy: 14 }
    ];
    for (const p of pts) if (p.s) { p.t = p.s.t; p.x = p.s.x; } else p.hide = true;
    const into = rec ? 'mix' : rot ? 'rot' : 'oda';
    const lines = [
      { from: 'oda', to: 'rot', color: '--accent', arrow: true },
      { from: 'eta', to: 'eha', color: '--eha', arrow: true, dash: [6, 4] },
      { from: 'rot', to: 'eta', color: '--rca', dash: [2, 4], w: 1.6 },
      { from: rot ? 'rot' : 'oda', to: 'eta', color: '--rca', dash: [2, 4], w: 1.6 },
      { from: into, to: 'cc', color: '--chwr', arrow: true },
      { from: 'cc', to: 'adp', color: '--text-3', dash: [3, 4], w: 1.2 },
      { from: coilOn ? 'cc' : into, to: 'sup', color: '--sup', arrow: true },
      { from: 'sup', to: 'eta', color: '--eta', dash: [4, 4], w: 1.4, arrow: true }
    ];
    if (!rec) { lines.splice(2, 2); }
    return { points: pts, lines };
  }
  function refreshHX(o) {
    const data = hxData(o);
    Charts.drawHX($('#hx'), data, Psy);
    const rows = data.points.filter((p) => !p.hide && p.id !== 'adp').map((p) => `<tr><td><span class="pt" style="background:var(${p.color})">${p.n}</span>${esc(p.name)}</td><td>${f(p.s.t, 1)}</td><td>${f(p.s.rh, 0)}</td><td>${f(p.s.x, 2)}</td><td>${f(p.s.h, 1)}</td><td>${f(p.s.td, 1)}</td><td>${f(p.q, 0)}</td></tr>`).join('');
    const tb = $('#hx-tbody');
    if (tb.innerHTML !== rows) tb.innerHTML = rows;
    $('#hx-note').innerHTML = `Ciśnienie barometryczne ${f(CFG.p * 10, 0)} hPa. Przemiany: 1→2 wymiennik obrotowy (schładzanie i osuszanie powietrza świeżego), 2+6→3 mieszanie z recyrkulacją, 3→4 chłodnica (ADP ${o.C.adp != null && o.C.Q > 0.1 ? f(o.C.adp, 1) + ' °C' : '—'}, BF ${o.C.bf != null ? f(o.C.bf, 2) : '—'}), 4→5 podgrzew w wentylatorze (+${f(o.dTf, 1)} K), 5→6 zyski ciepła i wilgoci w strefie, 6→7 strona wywiewna wymiennika i wentylator EF.`;
  }
  const hxCanvas = $('#hx'), hxTip = $('#hx-tip');
  hxCanvas.addEventListener('mousemove', (e) => {
    const r = hxCanvas.getBoundingClientRect();
    const q = Charts.hxHit(e.clientX - r.left, e.clientY - r.top);
    if (!q) { hxTip.hidden = true; return; }
    const p = q.p;
    hxTip.innerHTML = `<h4>${p.n ? p.n + '. ' : ''}${esc(p.name)}</h4><table><tr><td>t</td><td>${f(p.s.t, 1)} °C</td></tr><tr><td>φ</td><td>${f(p.s.rh, 0)} %</td></tr><tr><td>x</td><td>${f(p.s.x, 2)} g/kg</td></tr><tr><td>h</td><td>${f(p.s.h, 1)} kJ/kg</td></tr><tr><td>t<sub>r</sub></td><td>${f(p.s.td, 1)} °C</td></tr></table>`;
    hxTip.hidden = false;
    positionTip(hxTip, e.clientX - r.left + 12, e.clientY - r.top + 12, hxCanvas);
  });
  hxCanvas.addEventListener('mouseleave', () => { hxTip.hidden = true; });

  function positionTip(tip, x, y, cv) {
    const wrap = cv.parentElement, w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.min(x + 12, wrap.clientWidth - w - 8)}px`;
    tip.style.top = `${Math.min(y + 12, wrap.clientHeight - h - 8)}px`;
  }

  // ---------------------------------------------------------------- widok: trendy
  const trCanvas = $('#trend'), trTip = $('#trend-tip');
  const lg = $('#trend-legend');
  for (const P of Charts.PANELS) for (const s of P.series) {
    const b = document.createElement('button');
    b.innerHTML = `<i style="background:var(${s.c[0] === '-' ? s.c : '--text'})${s.dash ? ';opacity:.7' : ''}"></i>${esc(s.n)}`;
    b.classList.toggle('off', Charts.hidden.has(s.k));
    b.addEventListener('click', () => {
      if (Charts.hidden.has(s.k)) Charts.hidden.delete(s.k); else Charts.hidden.add(s.k);
      b.classList.toggle('off', Charts.hidden.has(s.k));
      refreshTrend(true);
    });
    lg.appendChild(b);
  }
  let trLen = -1;
  function refreshTrend(force) {
    const h = sim.state.hist;
    if (!force && h.length === trLen) return;
    trLen = h.length;
    Charts.drawTrend(trCanvas, h);
  }
  trCanvas.addEventListener('mousemove', (e) => {
    const r = trCanvas.getBoundingClientRect(), mx = e.clientX - r.left;
    const row = Charts.trendAt(mx);
    if (!row) { trTip.hidden = true; Charts.TR.hoverT = null; refreshTrend(true); return; }
    Charts.TR.hoverT = row.t;
    refreshTrend(true);
    let html = `<h4>${hhmm(row.t)} · ${esc(REG_FULL[row.mode] || '')}</h4><table>`;
    for (const P of Charts.PANELS) for (const s of P.series) {
      if (Charts.hidden.has(s.k) || row[s.k] == null) continue;
      const unit = s.right ? 'ppm' : P.unit, dec = s.right ? 0 : P.dec;
      html += `<tr><td><span class="sw" style="background:${Charts.colorOf(s.c)}"></span>${esc(s.n)}</td><td>${f(row[s.k], dec)} ${unit}</td></tr>`;
    }
    trTip.innerHTML = html + '</table>';
    trTip.hidden = false;
    positionTip(trTip, mx, e.clientY - r.top, trCanvas);
  });
  trCanvas.addEventListener('mouseleave', () => { trTip.hidden = true; Charts.TR.hoverT = null; refreshTrend(true); });

  // ---------------------------------------------------------------- widok: alarmy
  const LVL = { warn: 'OSTRZEŻENIE', alarm: 'ALARM', info: 'INFO', ok: 'NORMA', man: 'OPERATOR' };
  let alKey = '';
  function refreshAlarms() {
    const s = sim.state, key = s.alarms.map((a) => a.code).join() + '|' + s.events.length + ':' + (s.events[0] ? s.events[0].t : 0);
    if (key === alKey) return;
    alKey = key;
    $('#al-active').innerHTML = s.alarms.length
      ? s.alarms.map((a) => `<tr><td class="lvl"><span class="lvl-badge ${a.lvl}">${LVL[a.lvl]}</span></td><td>${a.code}</td><td>${esc(a.text)}</td><td>${hhmm(alarmSince[a.code] != null ? alarmSince[a.code] : s.t)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty" style="text-align:left;font-family:var(--font)">Brak aktywnych alarmów.</td></tr>';
    $('#al-log').innerHTML = s.events.slice(0, 120).map((e) => `<tr><td>${e.t >= 0 ? dateStr(e.t).slice(5) : '14.07.2026'} ${hhmm(e.t, true)}</td><td class="lvl"><span class="lvl-badge ${e.lvl}">${LVL[e.lvl]}</span></td><td>${esc(e.text)}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------- widok: harmonogram
  function renderSched() {
    const c = sim.ctl, g = $('#sched-grid');
    let html = '<div></div>';
    for (let h = 0; h < 24; h++) html += `<div class="h">${h % 3 === 0 ? pad(h) : ''}</div>`;
    const names = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
    names.forEach((n, i) => {
      html += `<div class="d">${n}</div>`;
      for (let h = 0; h < 24; h++) {
        const day = i < 5 && h >= c.schedOn && h < c.schedOff;
        const night = c.nightPurge && (h >= c.purgeFrom || h < Math.ceil(c.purgeTo));
        html += `<div class="c ${day ? 'day' : night ? 'night' : ''}" title="${n} ${pad(h)}:00 — ${day ? 'program dzienny' : night ? 'okno chłodzenia nocnego' : 'postój'}"></div>`;
      }
    });
    g.innerHTML = html;
  }

  // ---------------------------------------------------------------- odświeżanie
  let uiT = 0, chT = 0;
  function refresh(force) {
    const o = sim.out, m = sim.meas;
    if (!o) return;
    Schematic.update(o, m, disp, sim.ctl, sim.manual, sim.state.alarms);
    $('#clock-time').textContent = hhmm(sim.t, true);
    $('#clock-date').textContent = dateStr(sim.t);
    $('#out-t').textContent = `${f(disp('TE01', m.TE01, 0.05, true), 1)} °C`;
    $('#out-rh').textContent = `${f(m.ME01, 0)} %`;
    $('#out-h').textContent = `h ${f(o.oda.h, 1)} kJ/kg`;
    refreshSide(o);
    updateFace();
    if (view === 'hx') refreshHX(o);
    if (view === 'trend') refreshTrend(force);
    if (view === 'alarms') refreshAlarms();
    if (view === 'sched' && force) renderSched();
  }
  function redrawCharts(force) {
    if (view === 'hx') refreshHX(sim.out);
    if (view === 'trend') refreshTrend(force);
  }
  window.addEventListener('resize', () => redrawCharts(true));

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (speed > 0) {
      sim.advance(dt * speed, speed > 60 ? 10 : 5);
      Schematic.animate(dt, sim.out);
    }
    uiT += dt;
    if (uiT >= 0.5) {
      uiT = 0;
      if (speed > 0) stepJitter();
      refresh(false);
    }
    requestAnimationFrame(frame);
  }

  // start
  let v0 = 'schemat';
  try { v0 = localStorage.getItem('bms-view') || 'schemat'; } catch (e) { /* brak dostępu */ }
  if (!$('#view-' + v0)) v0 = 'schemat';
  renderSched();
  show(v0);
  requestAnimationFrame(frame);
  window.BMS = { sim, show, openFace };
})();
