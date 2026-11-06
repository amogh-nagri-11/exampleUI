/* Research instruments: everything here reads the plan, so what the panes show is
   what the planner decided rather than a separate description of it. */
(function (M) {
  const h = M.h;
  const FAMILY = { sense: 'Sense', orient: 'Orient', decide: 'Decide', act: 'Act', record: 'Record' };
  M.FAMILY = FAMILY;
  const LAYOUT_WHY = {
    bento: 'Packs widgets into shelves on a column grid. Each shelf fills its row exactly, so size signals importance.',
    bsp: 'Cuts the screen in two by visual weight, then repeats. Depth grows with widget count.',
    masterDetail: 'A list drives a detail region. Selection is the main way to move through the data.',
    hero: 'One dominant widget holds attention. Everything else stays peripheral in a rail and strip.',
    wall: 'An equal, fixed grid with no primary widget. Suits glanceable monitoring from a distance.',
    feed: 'A single column, grouped by workflow step, read top to bottom like a narrative.',
    lanes: 'Columns follow the operator loop of sensing, deciding and acting.',
    orbit: 'A central widget with supporting widgets on both flanks.',
    pods: 'Widgets are grouped by role into tabbed pods. Density is low but widgets are one click deeper.',
    free: 'Widgets sit in continuous space with no column grid. Wires show which ones share data.',
    radial: 'One hub widget with the rest arranged around it, each wired back to the hub.',
    spine: 'Widgets alternate either side of a central line, so reading order follows the work.',
    river: 'One long horizontal strip that you scroll through, with nothing held back in tabs.',
    cascade: 'Overlapping sheets, like a stack of windows. Clicking a sheet brings it to the front.',
    stack: 'A simple vertical stack used by the launch screen.'
  };
  const GLYPH = { page: '▧', region: '▨', module: '◰', shell: '▣', chrome: '▭', viewport: '◫', screen: '▤', container: '▦' };

  /* ---------- Mini blueprint: renders any screen's real layout tree at thumbnail scale ---------- */
  M.mini = function mini(n) {
    if (n.type === 'widget') return h('i', { class: 'mini-w f-' + n.family, title: n.name });
    const lay = n.layout || { mode: 'stack' };
    const dirRow = lay.mode === 'lanes' || lay.mode === 'river' || (lay.mode === 'split' && lay.dir === 'row');
    const el = h('div', { class: `mini-box ${lay.mode === 'free' ? 'mini-free' : lay.mode === 'grid' || lay.mode === 'spine' ? 'mini-grid' : dirRow ? 'mini-row' : 'mini-col'}${lay.mode === 'tabs' ? ' mini-tabs' : ''}` });
    if (lay.mode === 'spine') el.style.gridTemplateColumns = '1fr 1fr';
    if (lay.mode === 'grid') el.style.gridTemplateColumns = `repeat(${lay.cols},1fr)`;
    const kids = lay.mode === 'tabs' ? n.children.slice(0, 1) : n.children || [];
    kids.forEach((c) => {
      const k = mini(c);
      if (c.place && lay.mode === 'grid') { k.style.gridColumn = `span ${c.place.cs}`; if (!lay.fill) k.style.gridRow = `span ${c.place.rs}`; }
      if (c.grow) k.style.flexGrow = c.grow;
      if (c.free && lay.mode === 'free') Object.assign(k.style, { position: 'absolute', left: c.free.l + '%', width: c.free.w + '%', top: (c.free.t / lay.minH) * 100 + '%', height: (c.free.h / lay.minH) * 100 + '%', zIndex: c.free.z || 1 });
      el.append(k);
    });
    return el;
  };
  const screensOf = (plan) => plan.tree.children.find((c) => c.type === 'viewport').children;
  M.miniPlan = (plan) => { const s = screensOf(plan).find((x) => !x.hub); return h('div', { class: 'mini' }, s.children.map(M.mini)); };
  /* Whole-page thumbnail: real page regions in the page's own colours, with the app's blueprint inside. */
  const toFr = (t) => t.replace(/minmax\(0, 1fr\)/g, '900fr').replace(/auto/g, '500fr').replace(/(\d+(?:\.\d+)?)px/g, '$1fr').replace(/(\d+(?:\.\d+)?)vh/g, (m, v) => v * 9 + 'fr').replace(/(\d+(?:\.\d+)?)%/g, (m, v) => v * 15 + 'fr');
  M.miniPage = (plan) => {
    const p = plan.page, id = plan.identity.palettes;
    const el = h('div', { class: 'minipage', style: { background: id.host.line, gridTemplateColumns: toFr(p.grid.cols), gridTemplateRows: toFr(p.grid.rows), gridTemplateAreas: p.grid.areas.map((a) => `"${a}"`).join(' ') } });
    el.append(h('div', { class: 'minipage-app', style: { gridArea: 'app', background: id.app.bg } }, M.miniPlan(plan)));
    p.regions.forEach((r) => {
      if (r.mode === 'float') for (let i = 0; i < r.open; i++) el.append(h('i', { class: 'minipage-float', style: { background: id.host.panel, right: 4 + i * 26 + '%', bottom: 6 + i * 22 + '%' } }));
      else if (r.mode === 'folio') el.append(h('i', { class: 'minipage-folio', style: { background: id.host.accent } }));
      else if (r.mode !== 'drawer') el.append(h('i', { style: { gridArea: r.id, background: id.host.panel, display: 'block' } }));
    });
    return el;
  };

  /* ---------- Widget tree ---------- */
  M.renderTree = function (host, plan, ui) {
    const collapsed = ui.collapsed;
    const rows = [];
    const inactive = new Set();
    const viewport = plan.tree.children.find((c) => c.type === 'viewport');
    viewport.children.forEach((s) => { if (s.id !== ui.screen) M.walk(s, (x) => inactive.add(x.id)); });
    const kidsOf = (n) => (n.appRoot ? [plan.tree] : n.children || []);
    const add = (n, d) => {
      const hasKids = kidsOf(n).length > 0;
      const isClosed = collapsed.has(n.id);
      const tag = n.type === 'widget' ? FAMILY[n.family] : n.layout ? n.layout.mode + (n.layout.dir ? ` ${n.layout.dir}` : '') : n.type === 'screen' ? n.strategy : n.mode || n.module || n.slot || n.type;
      rows.push(h('div', { class: `tn t-${n.type}${inactive.has(n.id) ? ' is-off' : ''}${ui.selected === n.id ? ' is-sel' : ''}`, 'data-tree': n.id, role: 'treeitem', 'aria-level': d + 1, 'aria-expanded': hasKids ? String(!isClosed) : null, style: { '--d': d } },
        h('span', { class: 'tn-guides' }),
        hasKids ? h('button', { type: 'button', class: 'tn-tog', 'aria-label': (isClosed ? 'Expand ' : 'Collapse ') + n.name, onclick: (ev) => { ev.stopPropagation(); if (isClosed) collapsed.delete(n.id); else collapsed.add(n.id); M.renderTree(host, plan, ui); } }, isClosed ? '▸' : '▾') : h('span', { class: 'tn-tog is-leaf' }),
        n.type === 'widget' ? h('span', { class: 'tn-dot f-' + n.family }) : h('span', { class: 'tn-glyph' }, GLYPH[n.type] || '▫'),
        h('button', { type: 'button', class: 'tn-name', onclick: () => ui.onSelect(n.id) }, n.name),
        h('span', { class: 'tn-tag' }, tag)));
      if (hasKids && !isClosed) kidsOf(n).forEach((c) => add(c, d + 1));
    };
    add(plan.pageTree, 0);
    host.replaceChildren(...rows);
  };

  M.renderNodeDetail = function (host, plan, id) {
    let node = null;
    [plan.pageTree, plan.tree].forEach((t) => M.walk(t, (x) => { if (x.id === id) node = x; }));
    if (!node) { host.replaceChildren(h('p', { class: 'muted' }, 'Select a node to see why the planner placed it.')); return; }
    const parts = [h('div', { class: 'nd-head' }, node.type === 'widget' ? h('span', { class: 'tn-dot f-' + node.family }) : null, h('b', null, node.name), h('code', null, node.id))];
    const kv = (k, v) => h('div', { class: 'nd-kv' }, h('span', null, k), h('span', null, v));
    if (node.type === 'widget') {
      const src = { required: `Required to cover ${node.why.cap} for ${node.why.step}.`, enrichment: `Added for context using spare ${node.why.cap} capacity.`, repair: `Injected by a repair for ${node.why.cap}.`, navigation: 'Required by hub navigation.' }[node.why.source];
      parts.push(h('p', { class: 'nd-why' }, src));
      parts.push(kv('Provides', node.caps.join(', ')), kv('Binds to', node.binds.join(', ') || 'none'), kv('Minimum width', node.minPx + ' px'));
      if (node.place) parts.push(kv('Grid cell', `${node.place.cs} × ${node.place.rs}`));
      const cands = node.why.candidates.slice(0, 5);
      parts.push(h('div', { class: 'nd-cands' }, h('div', { class: 'label' }, 'Selection probabilities'), cands.map((c) => h('div', { class: 'cand' + (c.id === node.widget ? ' is-win' : ''), title: `Score ${c.score}` }, h('span', null, M.catalogByKind[c.id].label), h('span', { class: 'cand-bar' }, h('i', { style: { width: c.p * 100 + '%' } })), h('span', { class: 'num' }, Math.round(c.p * 100) + ' %')))));
    } else {
      if (node.layout) parts.push(kv('Layout mode', node.layout.mode + (node.layout.dir ? `, ${node.layout.dir}` : '') + (node.layout.cols ? `, ${node.layout.cols} columns` : '')));
      if (node.type === 'screen') parts.push(kv('Strategy', (M.DIMENSIONS.layout.options[node.strategy] || 'Stack')), kv('Workflow nodes', node.nodes.join(', ') || 'none'));
      if (node.type === 'page') parts.push(kv('Composition', M.DIMENSIONS.composition.options[node.mode]), kv('Controls', `${plan.page.dock.form}, ${plan.page.dock.pos}`), kv('Identity', M.DIMENSIONS.skin.options[plan.identity.mood]), kv('Typeface', plan.identity.fontNames[0]), kv('Panels', plan.identity.treatment));
      if (node.mode && node.type === 'region') parts.push(kv('Arrangement', node.mode));
      parts.push(kv('Children', String((node.children || []).length)));
      if (node.why) parts.push(h('p', { class: 'nd-why' }, 'Injected by a repair so that alarms stay in view.'));
    }
    host.replaceChildren(...parts);
  };

  /* ---------- Workflow graph: a layered drawing of the plan's actual edges ---------- */
  M.renderGraph = function (host, plan, store, onPick, focusId) {
    const nodes = plan.workflow.nodes, edges = plan.workflow.edges;
    const fwd = edges.filter((e) => e.kind !== 'reject' && e.kind !== 'retry');
    const layer = {};
    nodes.forEach((n) => (layer[n.id] = 0));
    for (let i = 0; i < nodes.length; i++) fwd.forEach((e) => { layer[e.to] = Math.max(layer[e.to], layer[e.from] + 1); });
    const cols = Math.max(...Object.values(layer)) + 1;
    const NW = 80, NH = 40, GX = 18, GY = 10, PAD = 8, BACK = 36;
    const byLayer = Array.from({ length: cols }, () => []);
    nodes.forEach((n) => byLayer[layer[n.id]].push(n));
    const tall = Math.max(...byLayer.map((l) => l.length));
    const H = PAD * 2 + tall * NH + (tall - 1) * GY + BACK;
    const W = PAD * 2 + cols * NW + (cols - 1) * GX;
    const pos = {};
    byLayer.forEach((l, i) => {
      const blockH = l.length * NH + (l.length - 1) * GY;
      const y0 = PAD + ((H - BACK - PAD * 2) - blockH) / 2;
      l.forEach((n, j) => (pos[n.id] = { x: PAD + i * (NW + GX), y: y0 + j * (NH + GY) }));
    });
    const st = M.wfStatus(plan, store.done);
    const svg = h('svg:svg', { viewBox: `0 0 ${W} ${H}`, class: 'wf-svg', role: 'img', 'aria-label': `Workflow with ${nodes.length} nodes and ${edges.length} edges`, style: { minWidth: Math.round(W * 0.72) + 'px', maxWidth: Math.round(W * 1.4) + 'px' } },
      h('svg:defs', null, ['seq', 'back'].map((k) => h('svg:marker', { id: 'arr-' + k, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, h('svg:path', { d: 'M0 0L8 4L0 8Z', class: 'wf-arrow-' + k })))));
    const backLevels = {};
    edges.forEach((e, ei) => {
      const a = pos[e.from], b = pos[e.to];
      const back = e.kind === 'reject' || e.kind === 'retry';
      let d;
      if (back) {
        backLevels.n = (backLevels.n || 0) + 1;
        const yb = H - BACK + 6 + backLevels.n * 9;
        const x0 = a.x + NW / 2, x1 = b.x + NW / 2, y0 = a.y + NH, y1 = b.y + NH;
        d = `M${x0} ${y0} C${x0} ${yb} ${x1} ${yb} ${x1} ${y1 + 2}`;
      } else {
        const x0 = a.x + NW, y0 = a.y + NH / 2, x1 = b.x - 2, y1 = b.y + NH / 2, mid = (x0 + x1) / 2;
        d = `M${x0} ${y0} C${mid} ${y0} ${mid} ${y1} ${x1} ${y1}`;
      }
      const lit = !back && st[e.from] === 'done';
      svg.append(h('svg:path', { d, class: `wf-edge e-${e.kind}${lit ? ' is-lit' : ''}`, 'marker-end': `url(#arr-${back ? 'back' : 'seq'})` }, h('svg:title', null, `${e.from} to ${e.to}: ${e.kind}`)));
    });
    const actorMark = { human: 'H', agent: 'A', joint: 'J' };
    nodes.forEach((n) => {
      const p = pos[n.id], lines = n.verb.split(' + ');
      const g = h('svg:g', { class: `wf-node is-${st[n.id]}${n.id === focusId ? ' is-focus' : ''}${n.irreversible ? ' is-gate' : ''}`, transform: `translate(${p.x} ${p.y})`, tabindex: 0, role: 'button', 'aria-label': `${n.verb}, ${st[n.id]}, ${n.actor}`, onclick: () => onPick(n.id), onkeydown: (ev) => { if (ev.key === 'Enter') onPick(n.id); } },
        h('svg:title', null, `${n.label}. Actor: ${n.actor}. Needs: ${n.caps.join(', ')}.${n.irreversible ? ' Irreversible.' : ''}`),
        h('svg:rect', { width: NW, height: NH, rx: n.irreversible ? 2 : 7, class: 'wf-rect' }),
        lines.map((t, i) => h('svg:text', { x: 7, y: lines.length > 1 ? 15 + i * 15 : 17, class: 'wf-label' }, (i < lines.length - 1 ? t + ' +' : t).slice(0, 12))),
        h('svg:g', { transform: `translate(${NW - 17} 24)` }, h('svg:rect', { width: 13, height: 12, rx: 3, class: `wf-actor a-${n.actor}` }), h('svg:text', { x: 6.5, y: 9.5, class: 'wf-actor-t' }, actorMark[n.actor])));
      svg.append(g);
    });
    host.replaceChildren(svg);
  };

  /* ---------- Layout strategy ---------- */
  M.renderLayoutPane = function (host, plan, screenId, onPick) {
    const screens = screensOf(plan);
    const cur = screens.find((s) => s.id === screenId) || screens[0];
    let count = 0, deepest = 0, modes = new Set();
    M.walk(cur, (n, d) => { if (n.type === 'widget') count++; deepest = Math.max(deepest, d); if (n.layout) modes.add(n.layout.mode); });
    host.replaceChildren(
      h('div', { class: 'lp-main' },
        h('div', { class: 'mini mini-lg', 'aria-label': 'Blueprint of the current screen' }, cur.children.map(M.mini)),
        h('div', { class: 'lp-text' }, h('b', null, M.DIMENSIONS.layout.options[cur.strategy] || 'Launch stack'), h('p', null, LAYOUT_WHY[cur.strategy]), h('div', { class: 'lp-stats' }, `${count} widgets, ${deepest} levels deep`), h('div', { class: 'lp-stats' }, 'Modes: ' + [...modes].join(', ')))),
      screens.length > 1 ? h('div', { class: 'lp-thumbs' }, screens.map((s) => h('button', { type: 'button', class: 'lp-thumb' + (s.id === cur.id ? ' is-on' : ''), title: s.name, 'aria-label': 'Show screen ' + s.name, onclick: () => onPick(s.id) }, h('div', { class: 'mini' }, s.children.map(M.mini))))) : '',
      h('div', { class: 'fam-legend' }, Object.entries(FAMILY).map(([k, v]) => h('span', null, h('i', { class: 'f-' + k }), v))));
  };

  /* ---------- Runtime metadata ---------- */
  M.renderMeta = function (host, plan, store, ctx) {
    const m = plan.metrics;
    const item = (label, value, title, cls) => h('div', { class: 'mt', title }, h('span', { class: 'mt-l' }, label), h('b', { class: 'mt-v ' + (cls || '') }, value));
    const novelty = ctx.history.map((g) => g.distance ? g.distance.novelty : 0);
    const chart = h('div', { class: 'nv-bars', role: 'img', 'aria-label': `Novelty for the last ${Math.min(24, novelty.length)} generations` },
      ctx.history.slice(-24).map((g) => h('button', { type: 'button', class: 'nv-bar' + (g === ctx.current ? ' is-on' : ''), title: `G${g.gen}: novelty ${g.distance ? g.distance.novelty.toFixed(2) : 'first plan'}`, 'aria-label': `Restore generation ${g.gen}`, onclick: () => ctx.onRestore(g) }, h('i', { style: { height: Math.max(3, (g.distance ? g.distance.novelty : 0) * 100) + '%' } }))));
    host.replaceChildren(
      h('div', { class: 'mt-grid' },
        item('Plan time', m.planMs.toFixed(1) + ' ms', 'Measured time for this planning run in this browser'),
        item('Tree nodes', m.nodes, 'All nodes in the generated tree'),
        item('Widgets', m.widgets, `${m.kinds} distinct widget kinds`),
        item('Containers', m.containers, 'Layout containers in the tree'),
        item('Tree depth', m.depth, 'Longest path from the shell to a leaf'),
        item('Max breadth', m.breadth, 'Largest number of children under one node'),
        item('Screens', m.screens, 'Screens the workflow was partitioned into'),
        item('Widgets per screen', m.perScreen, 'Mean widgets per screen'),
        item('Density', Math.round(m.density * 100) + ' %', 'Mean widgets per screen as a share of the device budget'),
        item('Workflow', `${m.steps} / ${m.edges}`, 'Workflow nodes and edges'),
        item('Agent share', Math.round(m.agentShare * 100) + ' %', 'Share of workflow nodes run by the agent'),
        item('Repairs', m.repairs, 'Constraint repairs applied in this plan'),
        item('Actions, predicted', m.operatorActions, 'Estimated operator actions to finish the workflow, from actor and interaction model'),
        item('Actions, observed', store.actions, 'Actual actions you have taken on this goal, including exploration'),
        item('Nav overhead', m.navOverhead, 'Extra clicks needed if the operator changes screens by hand'),
        item('Novelty', ctx.current.distance ? ctx.current.distance.novelty.toFixed(2) : 'n/a', 'Structural distance from the previous generation, from 0 to 1')),
      h('div', { class: 'nv' }, h('div', { class: 'label' }, 'Novelty by generation'), chart));
  };

  /* ---------- Trace, constraints, changes ---------- */
  M.renderTrace = function (host, plan) {
    host.replaceChildren(h('ol', { class: 'trace' }, plan.stages.map((s) => h('li', null, h('div', { class: 'trace-h' }, h('b', null, s.name), h('span', { class: 'num' }, s.ms.toFixed(2) + ' ms')), s.lines.map((l) => h('p', { class: l.startsWith('Repair') ? 'is-repair' : '' }, l))))));
  };
  M.renderConstraints = function (host, plan) {
    const icon = { pass: '●', repaired: '◆', warn: '▲', fail: '✕' };
    const word = { pass: 'Held', repaired: 'Repaired', warn: 'Overridden', fail: 'Failed' };
    host.replaceChildren(h('ul', { class: 'cons' }, plan.constraints.map((c) => h('li', { class: 'c-' + c.status }, h('span', { class: 'c-state' }, icon[c.status] + ' ' + word[c.status]), h('b', null, c.label), h('p', null, c.detail)))));
  };
  M.renderChanges = function (host, current) {
    const d = current.distance;
    if (!d) { host.replaceChildren(h('p', { class: 'muted' }, 'This is the first plan. Regenerate to see what changes.')); return; }
    host.replaceChildren(h('div', { class: 'chg' },
      h('p', null, h('b', null, `${d.changes.length} of ${Object.keys(M.DIMENSIONS).length} strategies changed`), `. Tree shingle distance ${d.jaccard}, ${d.sameGoal ? 'same goal' : 'different goal'}.`),
      d.changes.length ? h('ul', null, d.changes.map((c) => h('li', null, h('span', { class: 'label' }, M.DIMENSIONS[c.dim].label), h('span', null, c.from), h('span', { class: 'muted' }, ' → '), h('b', null, c.to)))) : null,
      d.added.length ? h('p', null, h('span', { class: 'label' }, 'Added '), d.added.map((k) => M.catalogByKind[k].label).join(', ')) : null,
      d.removed.length ? h('p', null, h('span', { class: 'label' }, 'Removed '), d.removed.map((k) => M.catalogByKind[k].label).join(', ')) : null));
  };

  /* ---------- Design-space atlas: samples many plans to show the distribution, not one outcome ---------- */
  M.renderAtlas = function (host, opts) {
    const scopeAll = opts.scope === 'all';
    const N = 36;
    const plans = [];
    for (let i = 0; i < N; i++) {
      const goalId = scopeAll ? M.PACKS[i % M.PACKS.length].id : opts.goalId;
      plans.push(M.plan({ goalId, seed: M.newSeed(), ctx: opts.ctx, locks: opts.locks, goalText: scopeAll ? undefined : opts.goalText }));
    }
    const unique = new Set(plans.map((p) => Object.values(p.strategy).join('|'))).size;
    let dist = 0;
    for (let i = 1; i < N; i++) dist += M.distance(plans[i - 1], plans[i]).novelty;
    const failed = plans.filter((p) => p.constraints.some((c) => c.status === 'fail')).length;
    const repairs = plans.reduce((a, p) => a + p.metrics.repairs, 0) / N;
    const stat = (l, v) => h('div', { class: 'mt' }, h('span', { class: 'mt-l' }, l), h('b', { class: 'mt-v' }, v));
    const dists = Object.entries(M.DIMENSIONS).map(([dim, def]) => {
      const counts = {};
      plans.forEach((p) => { counts[p.strategy[dim]] = (counts[p.strategy[dim]] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return h('div', { class: 'ad' }, h('div', { class: 'label' }, def.label), sorted.map(([k, c]) => h('div', { class: 'ad-row', title: `${def.options[k]}: ${c} of ${N}` }, h('span', { class: 'ad-name' }, def.options[k]), h('span', { class: 'cand-bar' }, h('i', { style: { width: (c / N) * 100 + '%' } })), h('span', { class: 'num' }, c))));
    });
    host.replaceChildren(
      h('div', { class: 'atlas-stats' }, stat('Plans sampled', N), stat('Distinct strategy sets', unique), stat('Mean novelty, consecutive', (dist / (N - 1)).toFixed(2)), stat('Repairs per plan', repairs.toFixed(1)), stat('Plans with failed constraints', failed)),
      h('div', { class: 'atlas-body' },
        h('div', { class: 'atlas-grid' }, plans.map((p) => h('button', { type: 'button', class: 'atlas-cell', onclick: () => opts.onPick(p), title: `Open plan ${p.seed}` }, M.miniPage(p), h('span', { class: 'atlas-t' }, M.DIMENSIONS.composition.options[p.strategy.composition]), h('span', { class: 'atlas-s' }, `${M.DIMENSIONS.skin.options[p.strategy.skin]} · ${M.DIMENSIONS.layout.options[p.strategy.layout]} · ${M.DIMENSIONS.interaction.options[p.strategy.interaction]}`), scopeAll ? h('span', { class: 'atlas-s' }, M.PACKS.find((x) => x.id === p.goalId).domain) : null))),
        h('div', { class: 'atlas-dist' }, dists)));
  };
})(window.Morphogen = window.Morphogen || {});
