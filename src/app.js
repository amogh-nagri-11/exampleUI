/* Bench controller: owns experiment state, replans on any change, and keeps the
   generated application and the inspectors in step with each other. */
(function (M) {
  const h = M.h;
  const $ = (id) => document.getElementById(id);
  const state = {
    goalId: 'refinery', goalText: null, goalNote: null, seed: 'a71c04', ctx: M.defaultContext(), locks: {},
    history: [], current: null, gen: 0, stores: {}, rt: null, xray: false,
    evolve: null, walk: null, evo: null, evoTimer: null, evoShown: null, evoShownFit: -1, tab: 'trace', inspectTab: 'tree', ui: { collapsed: new Set(), selected: null, screen: null, onSelect: null }
  };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storeFor = (pack) => state.stores[pack.id] || (state.stores[pack.id] = M.newStore(pack));
  const packOf = (id) => M.PACKS.find((p) => p.id === id);

  /* ---------- Planning ---------- */
  const input = () => ({ goalId: state.goalId, ctx: state.ctx, locks: state.locks, goalText: state.goalText, goalNote: state.goalNote });
  function replan(origin, reason) { adopt(M.plan(Object.assign(input(), { seed: state.seed })), origin, reason); }
  /* A new seed must produce a page unlike the current one; see M.planDistinct. */
  function replanDistinct(origin) {
    const plan = M.planDistinct(input(), state.current && state.current.plan, M.newSeed);
    state.seed = plan.seed;
    adopt(plan, origin);
  }
  function adopt(plan, origin, reason) {
    const prev = state.current;
    const entry = { gen: ++state.gen, plan, origin, reason, distance: prev ? M.distance(prev.plan, plan) : null };
    state.history.push(entry);
    if (state.history.length > 60) state.history.shift();
    show(entry, reason);
  }
  function show(entry, reason) {
    const apply = () => {
      if (state.rt) state.rt.destroy();
      state.current = entry;
      const plan = entry.plan, pack = packOf(plan.goalId), store = storeFor(pack);
      const rt = M.createRuntime(plan, pack, store, {
        onActions: renderMeta,
        onStep: () => { renderGraph(); renderMeta(); checkFinished(); },
        onScreen: (id) => { state.ui.screen = id; renderTree(); renderLayout(); },
        paused: () => false
      });
      state.rt = rt;
      M.applyPage(plan);
      rt.mount($('gen'));
      rt.on('step', renderGraph);
      state.ui.screen = rt.currentScreen;
      state.ui.selected = firstWidget(plan, rt.currentScreen);
      state.ui.collapsed = new Set();
      $('stage-frame').className = 'stage-frame frame-' + plan.ctx.device;
      renderAll();
      syncControls();
      const moved = M.settleDock(plan);
      if (moved) { const pg = plan.stages.find((s) => s.name === 'Page'); if (!pg.lines.some((l) => l.startsWith('Repair: moved'))) pg.lines.push(`Repair: moved the controls to the ${{ tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right' }[moved]} corner, where they cover the least content.`); renderTabs(); }
      if (reason) toast(reason);
    };
    const motion = entry.plan.page.motion;
    document.documentElement.dataset.motion = motion;
    if (document.startViewTransition && !reduced() && state.current) document.startViewTransition(apply);
    else { apply(); }
  }
  function firstWidget(plan, screenId) {
    let id = null;
    const s = plan.tree.children.find((c) => c.type === 'viewport').children.find((x) => x.id === screenId);
    if (s) M.walk(s, (n) => { if (!id && n.type === 'widget') id = n.id; });
    return id;
  }
  function checkFinished() {
    const { plan, } = state.current, store = state.rt.store;
    const st = M.wfStatus(plan, store.done);
    if (plan.workflow.nodes.every((n) => st[n.id] === 'done') && !store.announced) {
      store.announced = true;
      stopWalk();
      toast(`Goal reached with ${store.actions} operator actions. This plan predicted ${plan.metrics.operatorActions}.`);
    }
  }

  function regenerate() { stopEvo(); replanDistinct('regenerate'); }
  function newGoal() {
    const others = M.PACKS.filter((p) => p.id !== state.goalId);
    setGoal(others[Math.floor(Math.random() * others.length)].id);
    replanDistinct('goal');
  }
  function setGoal(id) { state.goalId = id; state.goalText = null; state.goalNote = null; }
  function applyTypedGoal(text) {
    const res = M.parseGoal(text, state.goalId);
    state.goalId = res.pack.id;
    state.goalText = text;
    Object.assign(state.ctx, res.ctx);
    const moved = Object.keys(res.ctx);
    state.goalNote = res.matched
      ? `Typed goal matched ${res.hits.join(', ')}.${moved.length ? ` Wording also set ${moved.join(', ')}.` : ''}`
      : `Typed goal matched no keywords, so the ${res.pack.domain} pack stayed bound.${moved.length ? ` Wording set ${moved.join(', ')}.` : ''}`;
    $('goal-note').textContent = res.matched ? `Bound to ${res.pack.domain} from: ${res.hits.join(', ')}.` : `No domain words found. Stayed on ${res.pack.domain}.`;
    replanDistinct('goal');
  }

  /* ---------- Rendering ---------- */
  function renderAll() {
    renderGenome(); renderLineage(); renderTree(); renderLayout(); renderGraph(); renderMeta(); renderTabs(); renderSpec(); renderEvolution();
    $('stage').classList.toggle('xray', state.xray);
  }
  function renderTree() {
    if (!state.current) return;
    state.ui.onSelect = (id) => { state.ui.selected = id; renderTree(); if (id.startsWith('m-') && id !== 'm-app') { M.revealModule(id.slice(2)); return; } const el = state.rt.reveal(id); if (el) { el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); flash(el); } };
    M.renderTree($('tree'), state.current.plan, state.ui);
    M.renderNodeDetail($('node-detail'), state.current.plan, state.ui.selected);
    const m = state.current.plan.metrics;
    let pageNodes = 0; M.walk(state.current.plan.pageTree, () => pageNodes++);
    $('tree-count').textContent = `${m.nodes + pageNodes} nodes`;
  }
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function renderLayout() { M.renderLayoutPane($('layout'), state.current.plan, state.ui.screen, (id) => state.rt.goScreen(id)); }
  function renderGraph() {
    const focus = state.rt.focus();
    M.renderGraph($('graph'), state.current.plan, state.rt.store, (id) => {
      const st = state.rt.status();
      if (st[id] === 'pending') { toast('That step is waiting for earlier steps.'); return; }
      state.rt.setFocus(id);
      const s = state.rt.screens().find((x) => x.nodes.includes(id));
      if (s) state.rt.goScreen(s.id);
    }, focus && focus.id);
    $('wf-shape').textContent = M.DIMENSIONS.topology.options[state.current.plan.strategy.topology];
  }
  function renderMeta() {
    M.renderMeta($('meta'), state.current.plan, state.rt.store, { history: state.history, current: state.current, onRestore: restore });
  }
  function renderTabs() {
    const c = state.current, cons = c.plan.constraints;
    const repaired = cons.filter((x) => x.status === 'repaired').length;
    document.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === state.tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const held = cons.filter((x) => x.status === 'pass' || x.status === 'repaired').length;
    $('con-count').textContent = `${held}/${cons.length}${repaired ? `, ${repaired} repaired` : ''}`;
    const host = $('tab-body');
    if (state.tab === 'trace') M.renderTrace(host, c.plan);
    else if (state.tab === 'constraints') M.renderConstraints(host, c.plan);
    else M.renderChanges(host, c);
  }
  function renderSpec() {
    const { stages, identity, ...rest } = state.current.plan;
    const { palettes, ...look } = identity;
    const spec = { ...rest, identity: look };
    $('spec').textContent = JSON.stringify(spec, (k, v) => (k === 'why' && v ? { source: v.source, cap: v.cap } : v), 2);
    document.querySelectorAll('[data-itab]').forEach((b) => { const on = b.dataset.itab === state.inspectTab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('tree-pane').hidden = state.inspectTab !== 'tree';
    $('spec-pane').hidden = state.inspectTab !== 'spec';
  }
  function renderGenome() {
    const c = state.current, changed = c.distance ? new Set(c.distance.changes.map((x) => x.dim)) : new Set();
    $('genome').replaceChildren(...Object.entries(M.DIMENSIONS).map(([k, def]) => h('div', { class: 'gene' + (changed.has(k) ? ' is-changed' : '') + (state.locks[k] ? ' is-locked' : ''), title: changed.has(k) ? 'Changed in this generation' : 'Same as the previous generation' },
      h('span', { class: 'gene-k' }, def.label, state.locks[k] ? ' · locked' : changed.has(k) ? ' · changed' : ''), h('span', { class: 'gene-v' }, def.options[c.plan.strategy[k]]))));
    $('app-goal').textContent = c.plan.goal;
    $('seed').value = state.seed;
  }
  function renderLineage() {
    const list = $('lineage');
    list.replaceChildren(...state.history.map((g) => h('button', { type: 'button', class: 'lin' + (g === state.current ? ' is-on' : ''), title: `Generation ${g.gen}, seed ${g.plan.seed}: ${g.origin}. ${packOf(g.plan.goalId).domain}.`, 'aria-label': `Restore generation ${g.gen}`, onclick: () => restore(g) }, M.miniPage(g.plan), h('span', { class: 'lin-g' }, 'G' + g.gen))));
    const on = list.querySelector('.is-on');
    if (on) list.scrollLeft = on.offsetLeft - list.clientWidth + on.offsetWidth + 8;
  }
  function restore(g) {
    stopEvo();
    state.goalId = g.plan.goalId; state.goalText = g.plan.goal === packOf(g.plan.goalId).goal ? null : g.plan.goal;
    state.seed = g.plan.seed; state.ctx = { ...g.plan.ctx }; state.locks = { ...g.plan.locks };
    show(g);
  }
  function adoptPlan(p) {
    state.goalId = p.goalId; state.seed = p.seed; state.goalText = p.goal === packOf(p.goalId).goal ? null : p.goal;
    closeAtlas();
    adopt(p, 'atlas');
  }
  let toastT;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.hidden = true; }, 4200);
  }

  /* ---------- Controls ---------- */
  const SLIDERS = [['urgency', 'Urgency', 'Calm', 'Crisis'], ['expertise', 'Operator expertise', 'Novice', 'Expert'], ['autonomy', 'Agent autonomy', 'Manual', 'Autonomous'], ['entropy', 'Planner entropy', 'Greedy', 'Exploring']];
  const EVENTS = [
    ['Critical alarm', 'Urgency rose, so the planner replanned for a crisis.', { urgency: 0.97 }],
    ['Novice takes over', 'A novice took over, so the planner replanned for guidance.', { expertise: 0.1 }],
    ['Move to handheld', 'The operator moved to a handheld, so the planner replanned for touch.', { device: 'handheld' }],
    ['Hand off to agent', 'Autonomy rose, so the planner handed more steps to the agent.', { autonomy: 0.92 }]
  ];
  function buildControls() {
    const goal = $('goal');
    goal.replaceChildren(...['industrial', 'enterprise'].map((sec) => h('optgroup', { label: sec === 'industrial' ? 'Industrial' : 'Enterprise' }, M.PACKS.filter((p) => p.sector === sec).map((p) => h('option', { value: p.id }, `${p.domain}: ${p.goal}`)))));
    goal.addEventListener('change', () => { setGoal(goal.value); $('goal-note').textContent = ''; replanDistinct('goal'); });
    $('goal-form').addEventListener('submit', (ev) => { ev.preventDefault(); const v = $('goal-text').value.trim(); if (v) applyTypedGoal(v); else $('goal-note').textContent = 'Type a goal first, for example: urgent feeder outage for a novice on a phone.'; });

    let debounce;
    const replanSoon = () => { clearTimeout(debounce); debounce = setTimeout(() => replan('context'), 200); };
    $('sliders').replaceChildren(...SLIDERS.map(([k, label, lo, hi]) => {
      const out = h('output', { id: 'out-' + k, for: 'ctl-' + k, class: 'num' });
      return h('div', { class: 'sl' }, h('div', { class: 'sl-head' }, h('label', { for: 'ctl-' + k }, label), out),
        h('input', { id: 'ctl-' + k, type: 'range', min: 0, max: 1, step: 0.01, value: state.ctx[k], oninput: (ev) => { state.ctx[k] = +ev.target.value; out.textContent = (+ev.target.value).toFixed(2); replanSoon(); } }),
        h('div', { class: 'sl-ends' }, h('span', null, lo), h('span', null, hi)));
    }));
    $('devices').replaceChildren(...Object.entries(M.DEVICES).map(([k, d]) => h('button', { type: 'button', class: 'seg', 'data-device': k, onclick: () => { state.ctx.device = k; replan('context'); } }, d.label)));
    $('events').replaceChildren(...EVENTS.map(([label, reason, delta]) => h('button', { type: 'button', class: 'evt', onclick: () => { Object.assign(state.ctx, delta); replan('runtime event', reason); } }, label)));
    $('locks').replaceChildren(...Object.entries(M.DIMENSIONS).map(([k, def]) => h('div', { class: 'lk' }, h('label', { for: 'lock-' + k }, def.label),
      h('select', { id: 'lock-' + k, onchange: (ev) => { if (ev.target.value) state.locks[k] = ev.target.value; else delete state.locks[k]; replan('lock'); } }, h('option', { value: '' }, 'Planner decides'), Object.entries(def.options).map(([v, l]) => h('option', { value: v }, l))))));

    $('regen').addEventListener('click', regenerate);
    $('newgoal').addEventListener('click', newGoal);
    $('evolve').addEventListener('click', () => { stopEvo(); toggleEvolve(); });
    $('evo-toggle').addEventListener('click', toggleEvo);
    $('evo-dock').addEventListener('click', toggleEvo);
    $('evo-step').addEventListener('click', () => { stopEvo(); evoStep(); syncEvoButtons(); });
    $('evo-reset').addEventListener('click', () => { stopEvo(); state.evo = null; state.evoShown = null; renderEvolution(); syncEvoButtons(); });
    $('atlas-open').addEventListener('click', openAtlas);
    $('xray').addEventListener('click', () => { state.xray = !state.xray; $('xray').setAttribute('aria-pressed', state.xray); $('stage').classList.toggle('xray', state.xray); });
    $('dock-more').addEventListener('click', () => { const open = $('dock').classList.toggle('is-open'); $('dock-more').setAttribute('aria-expanded', open); });
    $('instr-toggle').addEventListener('click', M.toggleInstruments);
    $('walk').addEventListener('click', toggleWalk);
    $('restart').addEventListener('click', () => { const pack = packOf(state.goalId); state.stores[pack.id] = M.newStore(pack); show(state.current, 'Workflow progress reset.'); });
    $('seed-form').addEventListener('submit', (ev) => { ev.preventDefault(); const v = $('seed').value.trim(); if (v) { state.seed = v; replan('seed'); } });
    $('copy-spec').addEventListener('click', (ev) => {
      const btn = ev.currentTarget, text = $('spec').textContent;
      const done = (m) => { btn.textContent = m; setTimeout(() => { btn.textContent = 'Copy plan JSON'; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => done('Copied'), () => { selectSpec(); done('Press copy to finish'); });
      else { selectSpec(); done('Press copy to finish'); }
    });
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderTabs(); }));
    document.querySelectorAll('[data-itab]').forEach((b) => b.addEventListener('click', () => { state.inspectTab = b.dataset.itab; renderSpec(); }));
    $('atlas-close').addEventListener('click', closeAtlas);
    document.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => { atlasScope = b.dataset.scope; openAtlas(); }));
    $('atlas-resample').addEventListener('click', openAtlas);

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !$('atlas').hidden) { closeAtlas(); return; }
      if (ev.metaKey || ev.ctrlKey || ev.altKey || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      if (ev.key === 'r' || ev.key === 'R') regenerate();
      if (ev.key === 'g' || ev.key === 'G') newGoal();
      if (ev.key === 'x' || ev.key === 'X') $('xray').click();
      if (ev.key === 'e' || ev.key === 'E') toggleEvo();
    });

    /* Hover in either direction links a tree row with the widget it created. */
    const hl = (id, on) => {
      document.querySelectorAll('.is-linked').forEach((x) => x.classList.remove('is-linked'));
      if (!on || !id) return;
      const a = document.querySelector(`#gen [data-nid="${id}"]`), b = document.querySelector(`#tree [data-tree="${id}"]`);
      if (a) a.classList.add('is-linked');
      if (b) b.classList.add('is-linked');
    };
    $('tree').addEventListener('pointerover', (ev) => { const r = ev.target.closest('[data-tree]'); hl(r && r.dataset.tree, !!r); });
    $('tree').addEventListener('pointerleave', () => hl(null, false));
    $('gen').addEventListener('pointerover', (ev) => { const r = ev.target.closest('.g-panel[data-nid]') || ev.target.closest('[data-nid]'); hl(r && r.dataset.nid, !!r); });
    $('gen').addEventListener('pointerleave', () => hl(null, false));
  }
  function selectSpec() { const r = document.createRange(); r.selectNodeContents($('spec')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function syncControls() {
    const c = state.ctx;
    $('goal').value = state.goalId;
    SLIDERS.forEach(([k]) => { $('ctl-' + k).value = c[k]; $('out-' + k).textContent = (+c[k]).toFixed(2); });
    document.querySelectorAll('[data-device]').forEach((b) => { const on = b.dataset.device === c.device; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    Object.keys(M.DIMENSIONS).forEach((k) => { $('lock-' + k).value = state.locks[k] || ''; });
  }
  function toggleEvolve() {
    if (state.evolve) { clearInterval(state.evolve); state.evolve = null; }
    else { regenerate(); state.evolve = setInterval(() => { if (!document.hidden) regenerate(); }, 6000); }
    $('evolve').setAttribute('aria-pressed', !!state.evolve);
    $('evolve').textContent = state.evolve ? 'Stop auto-regenerate' : 'Auto-regenerate';
  }

  /* ---------- Evolution: breeds variants of the current page and shows each new champion ---------- */
  const evoKey = () => JSON.stringify([state.goalId, state.goalText, state.ctx.device, ...['expertise', 'autonomy', 'urgency'].map((k) => Math.round(state.ctx[k] * 10)), state.locks]);
  function ensureEvo() {
    if (state.evo && state.evo.key === evoKey() && !state.evo.converged) return;
    state.evo = M.newEvolution(state.current.plan, input(), { seed: M.newSeed() });
    state.evo.key = evoKey();
    const base = state.evo.pop.find((x) => x.changes[0] === 'Starting design');
    state.evoShown = base.id; state.evoShownFit = base.fit;
  }
  function renderEvolution() {
    M.renderEvolution($('evo'), state.evo, { shownId: state.evoShown, onShow: (ind) => showIndividual(ind, null) });
  }
  function showIndividual(ind, reason) {
    state.evoShown = ind.id; state.evoShownFit = ind.fit; state.seed = ind.plan.seed;
    adopt(ind.plan, 'evolution', reason);
  }
  /* The page only changes when a better design appears, so it settles as evolution converges. */
  function evoStep() {
    ensureEvo();
    const evo = state.evo;
    M.evolveStep(evo);
    const best = evo.pop[0];
    if (best.fit > state.evoShownFit + 0.5) showIndividual(best, `Generation ${evo.gen}: fitness ${state.evoShownFit} → ${best.fit}`);
    else renderEvolution();
    if (evo.converged) { stopEvo(); toast(`Converged after ${evo.gen} generations at fitness ${evo.bestFit}.`); }
  }
  function syncEvoButtons() {
    const on = !!state.evoTimer;
    ['evo-toggle', 'evo-dock'].forEach((id) => { $(id).setAttribute('aria-pressed', on); $(id).textContent = on ? 'Pause evolution' : state.evo && !state.evo.converged ? 'Resume evolving' : 'Evolve'; });
  }
  function stopEvo() { if (state.evoTimer) { clearInterval(state.evoTimer); state.evoTimer = null; } syncEvoButtons(); }
  function toggleEvo() {
    if (state.evoTimer) { stopEvo(); return; }
    stopEvolveShuffle();
    ensureEvo(); renderEvolution(); M.revealModule('evolution');
    state.evoTimer = setInterval(() => { if (!document.hidden) evoStep(); }, 1200);
    syncEvoButtons();
  }
  function stopEvolveShuffle() { if (state.evolve) toggleEvolve(); }
  function stopWalk() { if (state.walk) { clearInterval(state.walk); state.walk = null; } $('walk').setAttribute('aria-pressed', false); $('walk').textContent = 'Simulate operator'; }
  function toggleWalk() {
    if (state.walk) { stopWalk(); return; }
    if (!state.rt.focus()) { const pack = packOf(state.goalId); state.stores[pack.id] = M.newStore(pack); show(state.current, 'Workflow progress reset for a new run.'); }
    $('walk').setAttribute('aria-pressed', true); $('walk').textContent = 'Stop operator';
    state.walk = setInterval(() => {
      const rt = state.rt, f = rt.focus();
      if (!f) { stopWalk(); return; }
      if (f.irreversible) rt.decide('approve');
      else if (f.actor !== 'agent') rt.complete();
    }, 1500);
  }
  let atlasScope = 'goal';
  function openAtlas() {
    $('atlas').hidden = false;
    document.querySelectorAll('[data-scope]').forEach((b) => { const on = b.dataset.scope === atlasScope; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    M.renderAtlas($('atlas-content'), { scope: atlasScope, goalId: state.goalId, goalText: state.goalText, ctx: state.ctx, locks: state.locks, onPick: adoptPlan });
    $('atlas-close').focus();
  }
  function closeAtlas() { $('atlas').hidden = true; $('atlas-open').focus(); }

  /* ---------- Boot ---------- */
  function boot() {
    buildControls();
    replan('first plan');
    setInterval(() => { if (state.rt && !document.hidden) state.rt.tick(); }, 2000);
    M.__state = state;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.Morphogen = window.Morphogen || {});
