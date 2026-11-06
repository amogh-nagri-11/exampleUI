/* Rebuilds the real page from plan.page. Instruments are long-lived DOM modules that keep
   their listeners and values; each plan moves them into a newly built structure. */
(function (M) {
  const h = M.h;
  const $ = (id) => document.getElementById(id);
  /* Cached: getElementById can't see a module while it sits in a container not yet attached. */
  const modCache = {};
  const modEl = (m) => modCache[m] || (modCache[m] = $('mod-' + m));
  const ALL = () => [...Object.keys(M.MODULES), 'app'];
  let revealers = {};

  function wrapTabs(region) {
    const bar = h('div', { class: 'rg-tabbar', role: 'tablist' });
    const body = h('div', { class: 'rg-tabbody' });
    region.modules.forEach((m) => body.append(modEl(m)));
    const show = (m) => {
      region.modules.forEach((x) => { modEl(x).hidden = x !== m; });
      bar.replaceChildren(...region.modules.map((x) => h('button', { type: 'button', role: 'tab', class: 'rg-tab' + (x === m ? ' is-on' : ''), 'aria-selected': x === m ? 'true' : 'false', onclick: () => show(x) }, M.MODULES[x])));
    };
    region.modules.forEach((m) => { revealers[m] = () => show(m); });
    show(region.modules[0]);
    return { bar, body };
  }
  function buildRegion(r) {
    const el = h('div', { class: `rg rg-${r.mode}`, style: { gridArea: r.id } });
    if (r.mode === 'tabs') { const t = wrapTabs(r); el.append(t.bar, t.body); return el; }
    if (r.mode === 'accordion') {
      r.modules.forEach((m, i) => {
        const d = h('details', { class: 'rg-acc' }, h('summary', null, M.MODULES[m]), modEl(m));
        d.open = i < r.open;
        revealers[m] = () => { d.open = true; d.scrollIntoView({ block: 'nearest' }); };
        el.append(d);
      });
      return el;
    }
    if (r.mode === 'mosaic') el.style.gridTemplateColumns = `repeat(auto-fit, minmax(min(100%, ${r.minCol}px), 1fr))`;
    r.modules.forEach((m) => { el.append(modEl(m)); revealers[m] = () => modEl(m).scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    return el;
  }
  function makeDraggable(card, handle) {
    let dx, dy, active = false;
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button,input,select,textarea,a')) return;
      const r = card.getBoundingClientRect(), p = card.offsetParent.getBoundingClientRect();
      active = true; dx = ev.clientX - r.left; dy = ev.clientY - r.top;
      Object.assign(card.style, { left: r.left - p.left + 'px', top: r.top - p.top + 'px', right: 'auto', bottom: 'auto' });
      handle.setPointerCapture(ev.pointerId);
    });
    handle.addEventListener('pointermove', (ev) => {
      if (!active) return;
      const p = card.offsetParent.getBoundingClientRect();
      card.style.left = Math.max(0, Math.min(p.width - 80, ev.clientX - p.left - dx)) + 'px';
      card.style.top = Math.max(0, Math.min(p.height - 40, ev.clientY - p.top - dy)) + 'px';
    });
    handle.addEventListener('pointerup', () => { active = false; });
  }

  let instrumentToggle = null;
  const syncToggle = (on) => $('instr-toggle').setAttribute('aria-pressed', on ? 'true' : 'false');
  M.CORNERS = ['tl', 'tr', 'bl', 'br'];

  M.applyPage = function (plan) {
    const page = plan.page, comp = $('comp'), stash = $('stash'), root = document.documentElement;
    /* Return every module to the stash so each plan builds from a clean page. */
    ALL().forEach((m) => { const el = modEl(m); el.hidden = false; el.removeAttribute('style'); stash.append(el); });
    comp.replaceChildren();
    instrumentToggle = null; revealers = {};
    Object.entries(plan.identity.hostVars).forEach(([k, v]) => root.style.setProperty(k, v));
    document.body.className = `pt-${plan.identity.hostTreatment} comp-${page.composition}`;
    ALL().forEach((m) => { modEl(m).style.viewTransitionName = 'mod-' + m; });

    Object.assign(comp.style, { gridTemplateColumns: page.grid.cols, gridTemplateRows: page.grid.rows, gridTemplateAreas: page.grid.areas.map((a) => `"${a}"`).join(' ') });
    comp.className = 'comp' + (page.grid.scroll ? ' comp-scroll' : '');
    const app = modEl('app');
    app.style.gridArea = 'app';
    app.style.padding = page.appInset + 'px';
    comp.append(app);

    page.regions.forEach((r) => {
      if (r.mode === 'drawer') {
        const tabs = wrapTabs(r);
        const drawer = h('div', { class: `drawer drawer-${r.side}`, style: { '--size': r.size + '%' }, hidden: true }, tabs.bar, tabs.body);
        comp.append(drawer);
        instrumentToggle = () => { drawer.hidden = !drawer.hidden; return !drawer.hidden; };
        r.modules.forEach((m) => { const show = revealers[m]; revealers[m] = () => { drawer.hidden = false; syncToggle(true); show(); }; });
      } else if (r.mode === 'float') {
        const others = M.CORNERS.filter((c) => c !== page.dock.pos);
        const menu = h('div', { class: 'instr-menu', hidden: true });
        const cards = r.modules.map((m, i) => {
          const corner = others[i % others.length];
          const card = h('div', { class: 'float', hidden: i >= r.open, style: { width: `min(${r.width}px, 92%)`, height: `min(${r.height}px, 80%)`, [corner[0] === 't' ? 'top' : 'bottom']: corner[0] === 't' ? '64px' : '12px', [corner[1] === 'l' ? 'left' : 'right']: '12px' } },
            h('div', { class: 'float-grip' }, h('span', null, M.MODULES[m]), h('button', { type: 'button', class: 'float-x', 'aria-label': 'Close ' + M.MODULES[m], onclick: () => { card.hidden = true; paintMenu(); } }, '×')), modEl(m));
          makeDraggable(card, card.firstChild);
          comp.append(card);
          revealers[m] = () => { card.hidden = false; paintMenu(); };
          return { m, card };
        });
        const paintMenu = () => menu.replaceChildren(...cards.map(({ m, card }) => h('button', { type: 'button', class: 'instr-item', 'aria-pressed': card.hidden ? 'false' : 'true', onclick: () => { card.hidden = !card.hidden; paintMenu(); } }, (card.hidden ? '○ ' : '● ') + M.MODULES[m])));
        paintMenu();
        comp.append(menu);
        instrumentToggle = () => { menu.hidden = !menu.hidden; return !menu.hidden; };
      } else if (r.mode === 'folio') {
        const pages = ['app', ...r.modules];
        const label = (m) => (m === 'app' ? 'Application' : M.MODULES[m]);
        const bar = h('div', { class: `folio-bar folio-${r.barSide}`, role: 'tablist' });
        const show = (m) => {
          pages.forEach((x) => { modEl(x).hidden = x !== m; });
          bar.replaceChildren(...pages.map((x) => h('button', { type: 'button', role: 'tab', class: 'rg-tab' + (x === m ? ' is-on' : ''), 'aria-selected': x === m ? 'true' : 'false', onclick: () => show(x) }, label(x))));
        };
        const body = h('div', { class: 'folio-body' });
        pages.forEach((m) => { body.append(modEl(m)); revealers[m] = () => show(m); });
        comp.append(h('div', { class: `folio folio-wrap-${r.barSide}` }, bar, body));
        show('app');
      } else comp.append(buildRegion(r));
    });

    /* Dock: same controls, new form and position every time. */
    const dock = $('dock');
    dock.className = `dock dock-${page.dock.form} at-${page.dock.pos}`;
    $('page').className = `page page-dock-${page.dock.form} page-at-${page.dock.pos}`;
    $('dock-more').setAttribute('aria-expanded', 'false');
    $('instr-toggle').hidden = !instrumentToggle;
    syncToggle(false);
  };
  M.revealModule = (m) => { if (revealers[m]) revealers[m](); };
  M.toggleInstruments = () => { if (instrumentToggle) syncToggle(instrumentToggle()); };

  /* A floating dock must never sit on the action the operator needs next. This is measured on
     the rendered page, because the plan can't know where the button finally lands. */
  M.settleDock = function (plan) {
    const dock = $('dock');
    if (plan.page.dock.form !== 'pill' && plan.page.dock.form !== 'orb') return null;
    /* Anything a person reads or presses counts. Actions weigh most, then titles and navigation. */
    const watched = [['#gen .g-primary, #gen .g-cmd-input', 10], ['#gen .g-appname, #gen .g-appstate, #gen .g-band button, .wordmark', 4], ['#gen .g-topnav-item, #gen .g-step, #gen .g-tick, #gen .g-rail-item, #gen .g-chip, .rg-tabbar, .folio-bar, .lineage, .float-grip, .gene, .pane-head, .rg-acc > summary, .mt', 1]];
    const cost = () => {
      const d = dock.getBoundingClientRect();
      let total = 0;
      watched.forEach(([sel, w]) => document.querySelectorAll(sel).forEach((b) => { const r = b.getBoundingClientRect(); if (r.width && !(r.right < d.left || r.left > d.right || r.bottom < d.top || r.top > d.bottom)) total += w; }));
      return total;
    };
    const start = plan.page.dock.pos;
    let best = start, bestCost = cost();
    if (!bestCost) return null;
    for (const c of M.CORNERS.filter((x) => x !== start)) {
      dock.classList.remove('at-tl', 'at-tr', 'at-bl', 'at-br');
      dock.classList.add('at-' + c);
      const k = cost();
      if (k < bestCost) { best = c; bestCost = k; }
    }
    dock.classList.remove('at-tl', 'at-tr', 'at-bl', 'at-br');
    dock.classList.add('at-' + best);
    return best === start ? null : best;
  };
})(window.Morphogen = window.Morphogen || {});
