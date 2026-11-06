/* Page planning: decides everything outside the generated app as well. Visual identity,
   where each instrument lives, how the controls appear, and how the page changes over.
   Pure and seeded, like the rest of the planner. */
(function (M) {
  /* ---------- Colour: OKLCH to sRGB, plus WCAG contrast so legibility is computed ---------- */
  function oklchToRgb(l, c, h) {
    const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
    const L = l + 0.3963377774 * a + 0.2158037573 * b, m = l - 0.1055613458 * a - 0.0638541728 * b, s = l - 0.0894841775 * a - 1.291485548 * b;
    const [x, y, z] = [L ** 3, m ** 3, s ** 3];
    return [4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z, -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z, -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z];
  }
  const inGamut = (rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);
  function hex(l, c, h) {
    let cc = c, rgb = oklchToRgb(l, cc, h);
    while (!inGamut(rgb) && cc > 0) { cc = Math.max(0, cc - 0.005); rgb = oklchToRgb(l, cc, h); }
    const enc = (v) => { const x = Math.max(0, Math.min(1, v)); return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255).toString(16).padStart(2, '0'); };
    return '#' + rgb.map(enc).join('');
  }
  function lum(col) {
    const v = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  M.contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* Walks lightness away from the backgrounds until the colour meets its contrast target on all of them. */
  function fit(l, c, h, backs, target, dark) {
    let cur = l;
    for (let i = 0; i < 60; i++) {
      const col = hex(cur, c, h);
      if (backs.every((b) => M.contrast(col, b) >= target)) return col;
      cur += dark ? 0.012 : -0.012;
      if (cur > 1 || cur < 0) break;
    }
    return dark ? '#ffffff' : '#000000';
  }

  /* ---------- Identity moods: starting regions in a continuous space, not fixed themes ---------- */
  const FONTS = {
    industrial: ['"Michroma"', '"IBM Plex Sans"', '"IBM Plex Mono"'], condensed: ['"Big Shoulders Display"', '"Barlow"', '"Share Tech Mono"'],
    wide: ['"Unbounded"', '"Figtree"', '"Fira Code"'], editorial: ['"Instrument Serif"', '"Instrument Sans"', '"DM Mono"'],
    warm: ['"Fraunces"', '"Work Sans"', '"DM Mono"'], quirky: ['"Bricolage Grotesque"', '"Karla"', '"JetBrains Mono"'],
    terminal: ['"Martian Mono"', '"JetBrains Mono"', '"JetBrains Mono"'], techno: ['"Chakra Petch"', '"Chakra Petch"', '"Martian Mono"'], display: ['"Syne"', '"Karla"', '"Fira Code"']
  };
  const MOODS = {
    hmi: { dark: false, hue: 230, c: 0.008, acc: 245, ac: 0.11, rad: [0, 3], fonts: ['industrial', 'condensed'], treat: ['framed', 'slab'], bg: ['plain'] },
    carbon: { dark: true, hue: 250, c: 0.012, acc: 205, ac: 0.11, rad: [2, 6], fonts: ['industrial', 'techno', 'condensed'], treat: ['framed', 'inset'], bg: ['plain', 'grid'] },
    blueprint: { dark: true, hue: 258, c: 0.07, acc: 225, ac: 0.11, rad: [0, 1], fonts: ['terminal', 'industrial'], treat: ['framed', 'bare', 'notch'], bg: ['grid'] },
    ceramic: { dark: false, hue: 85, c: 0.012, acc: 190, ac: 0.09, rad: [10, 20], fonts: ['warm', 'editorial', 'quirky'], treat: ['float', 'framed'], bg: ['plain'] },
    signal: { dark: true, hue: 285, c: 0.012, acc: 50, ac: 0.16, rad: [5, 11], fonts: ['display', 'wide', 'quirky'], treat: ['float', 'slab'], bg: ['plain', 'glow'] },
    phosphor: { dark: true, hue: 155, c: 0.035, acc: 150, ac: 0.16, rad: [0, 2], fonts: ['terminal'], treat: ['framed', 'bare'], bg: ['scan'] },
    paper: { dark: false, hue: 95, c: 0.028, acc: 30, ac: 0.14, rad: [0, 4], fonts: ['editorial', 'warm'], treat: ['bare', 'slab'], bg: ['dots', 'plain'] },
    concrete: { dark: false, hue: 60, c: 0.004, acc: 28, ac: 0.18, rad: [0, 0], fonts: ['condensed', 'display', 'wide'], treat: ['heavy', 'notch'], bg: ['plain', 'grid'] },
    aurora: { dark: true, hue: 300, c: 0.05, acc: 335, ac: 0.15, rad: [12, 24], fonts: ['wide', 'display', 'quirky'], treat: ['float', 'inset'], bg: ['glow'] },
    sodium: { dark: true, hue: 65, c: 0.04, acc: 72, ac: 0.14, rad: [0, 5], fonts: ['techno', 'condensed'], treat: ['notch', 'heavy'], bg: ['scan', 'plain'] }
  };
  M.MOOD_LABELS = { hmi: 'High-performance grey', carbon: 'Carbon console', blueprint: 'Blueprint', ceramic: 'Ceramic', signal: 'Night shift', phosphor: 'Phosphor', paper: 'Drafting paper', concrete: 'Raw concrete', aurora: 'Aurora', sodium: 'Sodium lamp' };

  function palette(mood, dark, hueShift, accShift, rng) {
    const hue = mood.hue + hueShift, c = mood.c, acc = mood.acc + accShift;
    const base = dark ? 0.15 + rng() * 0.06 : 0.9 + rng() * 0.05;
    const step = dark ? 1 : -1;
    const bg = hex(base, c, hue), panel = hex(base + (dark ? 0.035 : 0.04), c, hue), panel2 = hex(base + step * 0.07 + (dark ? 0 : 0.01), c * 1.2, hue);
    const line = hex(base + step * 0.16, c * 1.2, hue), line2 = hex(base + step * 0.3, c, hue), well = hex(base + (dark ? -0.04 : -0.05), c, hue);
    const backs = [panel, panel2, bg];
    const fg = fit(dark ? 0.93 : 0.22, c * 0.8, hue, backs, 7, dark);
    const mut = fit(dark ? 0.74 : 0.46, c, hue, backs, 4.5, dark);
    const accent = fit(dark ? 0.76 : 0.46, mood.ac, acc, backs, 4.5, dark);
    const on = M.contrast('#ffffff', accent) >= M.contrast('#0a0a0a', accent) ? '#ffffff' : '#0a0a0a';
    const soft = hex(base + step * 0.08 + (dark ? 0 : 0.015), Math.max(0.03, mood.ac * 0.3), acc);
    const status = (h, ch) => fit(dark ? 0.78 : 0.48, ch, h, backs, 4.5, dark);
    return { bg, panel, panel2, line, line2, well, fg, mut, accent, on, soft, ok: status(150, 0.14), warn: status(85, 0.14), crit: status(25, 0.17), dark };
  }
  const FAMILY_DARK = { sense: '#4a8bec', orient: '#27a78c', decide: '#bd8418', act: '#dc5580', record: '#9576e6' };
  const FAMILY_LIGHT = { sense: '#2f6fd6', orient: '#128a70', decide: '#a86f06', act: '#c63f6b', record: '#7a57d1' };

  M.planIdentity = function (moodId, rng) {
    const mood = MOODS[moodId];
    const between = (a, b) => a + rng() * (b - a);
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const hueShift = between(-24, 24), accShift = between(-34, 34);
    const app = palette(mood, mood.dark, hueShift, accShift, rng);
    const invert = rng() < 0.35;
    const host = invert ? palette(mood, !mood.dark, hueShift, accShift, rng) : palette(mood, mood.dark, hueShift + between(-12, 12), accShift, rng);
    const fontApp = FONTS[pick(mood.fonts)], fontHost = rng() < 0.7 ? fontApp : FONTS[pick(mood.fonts)];
    const radius = Math.round(between(mood.rad[0], mood.rad[1]));
    const fallbackUi = 'system-ui, "Helvetica Neue", Arial, sans-serif', fallbackMono = 'ui-monospace, Menlo, Consolas, monospace';
    const upper = rng() < 0.4;
    const gap = Math.round(between(4, 16)), pad = Math.round(between(7, 16));
    return {
      mood: moodId, radius, treatment: pick(mood.treat), hostTreatment: pick(mood.treat), bg: pick(mood.bg), invertInstruments: invert, gap, pad,
      fontNames: fontApp.map((f) => f.replace(/"/g, '')),
      appVars: {
        '--g-bg': app.bg, '--g-panel': app.panel, '--g-panel2': app.panel2, '--g-fg': app.fg, '--g-mut': app.mut, '--g-line': app.line, '--g-accent': app.accent, '--g-on': app.on,
        '--g-ok': app.ok, '--g-warn': app.warn, '--g-crit': app.crit, '--g-r': radius + 'px', '--g-gap': gap + 'px', '--g-pad': pad + 'px',
        '--g-head': `${upper ? fontApp[2] : fontApp[0]}, ${upper ? fallbackMono : fallbackUi}`, '--g-headw': upper ? '500' : '600', '--g-headt': upper ? 'uppercase' : 'none', '--g-heads': upper ? '10.5px' : Math.round(between(12, 17)) + 'px', '--g-headls': upper ? '0.08em' : '0',
        '--g-ui': `${fontApp[1]}, ${fallbackUi}`, '--g-data': `${fontApp[2]}, ${fallbackMono}`, '--g-display': `${fontApp[0]}, ${fallbackUi}`, 'color-scheme': app.dark ? 'dark' : 'light'
      },
      hostVars: Object.assign({
        '--bg': host.bg, '--panel': host.panel, '--panel-2': host.panel2, '--well': host.well, '--line': host.line, '--line-2': host.line2, '--fg': host.fg, '--mut': host.mut, '--accent': host.accent, '--on-accent': host.on, '--accent-soft': host.soft,
        '--ok': host.ok, '--warn': host.warn, '--crit': host.crit, '--font-display': `${fontHost[0]}, ${fallbackUi}`, '--font-ui': `${fontHost[1]}, ${fallbackUi}`, '--font-data': `${fontHost[2]}, ${fallbackMono}`, '--page-r': Math.min(radius, 12) + 'px', 'color-scheme': host.dark ? 'dark' : 'light'
      }, Object.fromEntries(Object.entries(host.dark ? FAMILY_DARK : FAMILY_LIGHT).map(([k, v]) => ['--' + k, v]))),
      palettes: { app, host }
    };
  };

  /* ---------- Page composition ---------- */
  M.MODULES = { masthead: 'Lineage', genome: 'Plan genome', controls: 'Experiment controls', tree: 'Widget tree', graph: 'Workflow graph', layout: 'Layout strategy', meta: 'Runtime metadata', trace: 'Planner trace', evolution: 'Evolution' };
  function shuffled(list, rng) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const region = (id, mode, modules, extra) => Object.assign({ id, mode, modules }, extra);
  const CORNERS = ['tl', 'tr', 'bl', 'br'];

  M.planPage = function (compId, rng) {
    const mods = shuffled(Object.keys(M.MODULES), rng);
    const coin = (p = 0.5) => rng() < p;
    const range = (a, b) => Math.round(a + rng() * (b - a));
    const pick = (l) => l[Math.floor(rng() * l.length)];
    const take = (n) => mods.splice(0, n);
    let grid, regions;
    switch (compId) {
      case 'immersive':
        grid = { cols: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr)', areas: ['app'] };
        regions = [region('drawer', 'drawer', mods.slice(), { side: pick(['left', 'right', 'bottom']), size: range(30, 44) })];
        break;
      case 'bench': {
        const a = take(range(2, 3)), b = take(range(2, 3)), c = mods.slice();
        const flip = coin(), under = coin(0.7), w1 = range(230, 320), w2 = range(250, 350), h = range(220, 300);
        const row = flip ? 'b app a' : 'a app b';
        grid = { cols: `${flip ? w2 : w1}px minmax(0, 1fr) ${flip ? w1 : w2}px`, rows: under ? `minmax(0, 1fr) ${h}px` : `${h}px minmax(0, 1fr)`, areas: under ? [row, 'c c c'] : ['c c c', row] };
        regions = [region('a', pick(['stack', 'tabs']), a), region('b', pick(['stack', 'tabs']), b), region('c', 'band', c)];
        break;
      }
      case 'ribbon': {
        const top = coin(), h = range(240, 330);
        grid = { cols: 'minmax(0, 1fr)', rows: top ? `${h}px minmax(0, 1fr)` : `minmax(0, 1fr) ${h}px`, areas: top ? ['r', 'app'] : ['app', 'r'] };
        regions = [region('r', 'band', mods.slice())];
        break;
      }
      case 'sidecar': {
        const left = coin(), w = range(30, 42);
        grid = { cols: left ? `${w}% minmax(0, 1fr)` : `minmax(0, 1fr) ${w}%`, rows: 'minmax(0, 1fr)', areas: [left ? 's app' : 'app s'] };
        regions = [region('s', 'accordion', mods.slice(), { open: range(1, 3) })];
        break;
      }
      case 'floating':
        grid = { cols: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr)', areas: ['app'] };
        regions = [region('f', 'float', mods.slice(), { open: range(1, 2), width: range(320, 420), height: range(260, 360) })];
        break;
      case 'theatre': {
        const t = take(2), l = take(2), r = take(2), bb = mods.slice();
        grid = { cols: `${range(230, 300)}px minmax(0, 1fr) ${range(240, 320)}px`, rows: `${range(170, 230)}px minmax(0, 1fr) ${range(190, 250)}px`, areas: ['t t t', 'l app r', 'b b b'] };
        regions = [region('t', 'band', t), region('l', 'tabs', l), region('r', 'tabs', r), region('b', 'band', bb)];
        break;
      }
      case 'scroll':
        grid = { cols: 'minmax(0, 1fr)', rows: `${range(78, 94)}vh auto`, areas: coin(0.8) ? ['app', 'm'] : ['m', 'app'], scroll: true };
        regions = [region('m', 'mosaic', mods.slice(), { minCol: range(280, 420) })];
        break;
      case 'folio':
        grid = { cols: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr)', areas: ['app'] };
        regions = [region('folio', 'folio', mods.slice(), { barSide: pick(['top', 'bottom', 'left', 'right']) })];
        break;
      default: {
        const side = coin(0.6), first = coin(), size = range(36, 50);
        const m = `${size}%`, a = 'minmax(0, 1fr)';
        grid = side ? { cols: first ? `${m} ${a}` : `${a} ${m}`, rows: a, areas: [first ? 'm app' : 'app m'] } : { cols: a, rows: first ? `${m} ${a}` : `${a} ${m}`, areas: first ? ['m', 'app'] : ['app', 'm'] };
        regions = [region('m', 'mosaic', mods.slice(), { minCol: range(240, 340) })];
      }
    }
    /* max-content, not auto: an auto track inside a fixed-height scroller collapses to nothing. */
    if (grid.scroll) { const vh = grid.rows.split(' ')[0]; grid.rows = grid.areas[0] === 'm' ? `max-content ${vh}` : `${vh} max-content`; }
    const form = pick(['pill', 'pill', 'bar', 'rail', 'orb']);
    const dock = { form, pos: form === 'bar' ? pick(['top', 'bottom']) : form === 'rail' ? pick(['left', 'right']) : pick(CORNERS) };
    return { composition: compId, grid, regions, dock, motion: pick(['morph', 'morph', 'iris', 'wipe', 'shutter', 'rise']), appInset: pick([0, 0, 6, 14]) };
  };

  M.pageTree = function (page) {
    const mod = (m) => ({ id: 'm-' + m, type: 'module', module: m, name: M.MODULES[m] });
    const kids = page.regions.map((r, i) => ({ id: 'r' + i, type: 'region', name: `${r.mode[0].toUpperCase()}${r.mode.slice(1)} region`, mode: r.mode, children: r.modules.map(mod) }));
    return { id: 'page', type: 'page', name: 'Page', mode: page.composition, children: [{ id: 'm-app', type: 'module', module: 'app', name: 'Generated app', appRoot: true }, ...kids] };
  };

  /* Accepts a candidate only when the whole page differs from the last one. Soft on what you hold fixed. */
  M.tooSimilar = function (a, b, locks) {
    const free = (k) => !(locks && locks[k]);
    const same = (k) => a.strategy[k] === b.strategy[k];
    if (['composition', 'skin', 'layout'].some((k) => free(k) && same(k))) return true;
    if (free('interaction') && free('nav') && same('interaction') && same('nav')) return true;
    const da = a.page.dock, db = b.page.dock;
    return da.form === db.form && da.pos === db.pos;
  };
  M.planDistinct = function (input, prev, nextSeed) {
    let plan, rejected = 0;
    for (let i = 0; i < 16; i++) {
      plan = M.plan(Object.assign({}, input, { seed: nextSeed() }));
      if (!prev || !M.tooSimilar(prev, plan, input.locks)) break;
      rejected++;
    }
    plan.stages.push({ name: 'Novelty gate', ms: 0, lines: [rejected ? `Rejected ${rejected} candidate${rejected > 1 ? 's' : ''} too close to the previous page.` : 'First candidate was already different from the previous page.'] });
    return plan;
  };
})(typeof window !== 'undefined' ? (window.Morphogen = window.Morphogen || {}) : (globalThis.Morphogen = globalThis.Morphogen || {}));
