/* The runtime planner: a pure function from (goal, context, seed, locks) to a UI plan.
   The planner is a seeded stochastic rule system, not an LLM. Each decision draws from
   its own random stream, so locking one dimension leaves the other draws unchanged. */
(function (M) {
  /* ---------- Widget catalog: the reusable parts every plan is assembled from ---------- */
  const w = (kind, label, family, caps, o) => Object.assign({ kind, label, family, caps, h: 1, span: 4, minPx: 220, dense: 0.5, novice: 0.5, urgent: 0.5, touch: 0.5, agent: 0 }, o);
  M.CATALOG = [
    w('kpi', 'KPI tiles', 'sense', ['monitor'], { span: 6, dense: 0.5, novice: 0.9, urgent: 0.7, touch: 0.8 }),
    w('gauge', 'Limit gauges', 'sense', ['monitor'], { span: 4, dense: 0.3, novice: 0.8, urgent: 0.8, touch: 0.8 }),
    w('trend', 'Trend chart', 'sense', ['trend', 'monitor'], { span: 6, h: 2, minPx: 280, dense: 0.6, novice: 0.6, urgent: 0.7 }),
    w('multitrend', 'Small-multiple trends', 'sense', ['trend', 'monitor'], { span: 6, h: 2, minPx: 300, dense: 0.95, novice: 0.2, urgent: 0.6, touch: 0.3 }),
    w('alarms', 'Alarm list', 'sense', ['alert', 'triage'], { span: 4, h: 2, dense: 0.7, novice: 0.6, urgent: 1, touch: 0.6 }),
    w('alarmband', 'Alarm band', 'sense', ['alert'], { span: 6, dense: 0.25, novice: 0.8, urgent: 0.9, touch: 0.9 }),
    w('mimic', 'Flow mimic', 'orient', ['locate', 'diagnose', 'monitor'], { span: 8, h: 2, minPx: 320, dense: 0.8, novice: 0.45, urgent: 0.8, sector: 'industrial', touch: 0.4 }),
    w('floor', 'Site map', 'orient', ['locate', 'monitor'], { span: 6, h: 2, minPx: 260, dense: 0.6, novice: 0.75, urgent: 0.6, touch: 0.8 }),
    w('heat', 'Heat matrix', 'orient', ['compare', 'diagnose'], { span: 6, h: 2, minPx: 330, dense: 0.95, novice: 0.2, urgent: 0.4, touch: 0.2 }),
    w('causes', 'Cause tree', 'orient', ['diagnose'], { span: 6, h: 2, minPx: 280, dense: 0.6, novice: 0.7, urgent: 0.45 }),
    w('table', 'Data grid', 'decide', ['triage', 'inspect', 'compare'], { span: 6, h: 2, minPx: 330, dense: 0.9, novice: 0.45, urgent: 0.5, touch: 0.35 }),
    w('board', 'Kanban board', 'decide', ['triage', 'plan'], { span: 8, h: 2, minPx: 340, dense: 0.6, novice: 0.75, urgent: 0.35, touch: 0.7 }),
    w('cards', 'Entity cards', 'decide', ['triage', 'inspect'], { span: 6, h: 2, dense: 0.35, novice: 0.85, urgent: 0.5, touch: 1 }),
    w('detail', 'Detail sheet', 'decide', ['inspect'], { span: 4, h: 2, dense: 0.45, novice: 0.75, urgent: 0.4, touch: 0.7 }),
    w('bars', 'Ranked bars', 'decide', ['compare'], { span: 4, h: 2, dense: 0.4, novice: 0.9, urgent: 0.55, touch: 0.7 }),
    w('risk', 'Risk matrix', 'decide', ['compare'], { span: 4, h: 2, dense: 0.55, novice: 0.5, urgent: 0.4, touch: 0.4 }),
    w('gantt', 'Timeline plan', 'decide', ['plan'], { span: 8, h: 2, minPx: 420, dense: 0.8, novice: 0.45, urgent: 0.3, touch: 0.25 }),
    w('advisor', 'Agent advisor', 'decide', ['advise', 'diagnose'], { span: 5, h: 2, dense: 0.35, novice: 0.95, urgent: 0.7, touch: 0.9, agent: 1 }),
    w('scenario', 'Scenario compare', 'decide', ['advise', 'compare'], { span: 7, h: 2, minPx: 300, dense: 0.65, novice: 0.55, urgent: 0.45, touch: 0.7, agent: 0.6 }),
    w('control', 'Setpoint control', 'act', ['control'], { span: 4, dense: 0.3, novice: 0.75, urgent: 0.8, touch: 0.8 }),
    w('actions', 'Action pad', 'act', ['control'], { span: 4, dense: 0.25, novice: 0.85, urgent: 1, touch: 1 }),
    w('form', 'Record form', 'act', ['submit'], { span: 5, h: 2, dense: 0.5, novice: 0.7, urgent: 0.3, touch: 0.6 }),
    w('checklist', 'Procedure checklist', 'act', ['verify', 'submit'], { span: 4, h: 2, dense: 0.4, novice: 0.95, urgent: 0.6, touch: 1 }),
    w('readiness', 'Readiness gates', 'act', ['verify', 'monitor'], { span: 5, dense: 0.55, novice: 0.6, urgent: 0.7, touch: 0.6 }),
    w('approval', 'Approval gate', 'act', ['approve'], { span: 5, h: 2, dense: 0.3, novice: 0.85, urgent: 0.7, touch: 0.95 }),
    w('signoff', 'Signature block', 'act', ['approve', 'audit'], { span: 5, h: 2, dense: 0.5, novice: 0.55, urgent: 0.45, touch: 0.5 }),
    w('log', 'Evidence log', 'record', ['audit'], { span: 5, h: 2, dense: 0.7, novice: 0.5, urgent: 0.5, touch: 0.5 }),
    w('sop', 'Procedure reference', 'record', ['guide'], { span: 4, h: 2, dense: 0.35, novice: 0.95, urgent: 0.3, touch: 0.7 }),
    w('launchpad', 'Launchpad', 'record', ['navigate'], { span: 12, h: 2, dense: 0.3, internal: true })
  ];
  const CAT = Object.fromEntries(M.CATALOG.map((c) => [c.kind, c]));
  M.catalogByKind = CAT;

  M.DEVICES = {
    wall: { label: 'Control wall', px: 1400, cols: 12, budget: 10 },
    desktop: { label: 'Desktop', px: 1000, cols: 12, budget: 7 },
    tablet: { label: 'Tablet', px: 760, cols: 8, budget: 5 },
    handheld: { label: 'Handheld', px: 360, cols: 4, budget: 4 }
  };
  M.DIMENSIONS = {
    interaction: { label: 'Interaction', options: { direct: 'Direct manipulation', guided: 'Guided procedure', conversational: 'Conversational agent', command: 'Command driven', supervisory: 'Supervisory autonomy', mixed: 'Mixed initiative' } },
    nav: { label: 'Navigation', options: { rail: 'Side rail', tabs: 'Top tabs', stepper: 'Stepper', hub: 'Hub and drill-down', palette: 'Command palette', timeline: 'Timeline scrubber', dock: 'Floating dock', anchors: 'Single-surface anchors', thread: 'Agent thread' } },
    topology: { label: 'Workflow', options: { linear: 'Linear', fork: 'Fork and join', loop: 'Gated loops', hub: 'Hub and spoke', compressed: 'Compressed by agent' } },
    partition: { label: 'Partition', options: { single: 'One surface', cluster: 'Clustered screens', perStep: 'One screen per step' } },
    layout: { label: 'Layout', options: { bento: 'Bento packing', bsp: 'Recursive split', masterDetail: 'Master and detail', hero: 'Focal and satellites', wall: 'Mission wall', feed: 'Narrative feed', lanes: 'Sense, decide, act lanes', orbit: 'Orbit', pods: 'Tabbed pods', free: 'Free field', radial: 'Hub and spokes', spine: 'Workflow spine', river: 'Horizontal river', cascade: 'Cascading sheets' } },
    skin: { label: 'Identity', options: { hmi: 'High-performance grey', carbon: 'Carbon console', blueprint: 'Blueprint', ceramic: 'Ceramic', signal: 'Night shift', phosphor: 'Phosphor', paper: 'Drafting paper', concrete: 'Raw concrete', aurora: 'Aurora', sodium: 'Sodium lamp' } },
    composition: { label: 'Page', options: { immersive: 'Immersive with drawer', bench: 'Instrument bench', ribbon: 'Ribbon band', sidecar: 'Sidecar accordion', floating: 'Floating cards', theatre: 'Theatre ring', scroll: 'Long scroll', folio: 'Full-page folio', split: 'Split mosaic' } }
  };

  /* ---------- Seeded randomness ---------- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function stream(seed, label) {
    let a = hash(seed + '|' + label);
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function softmax(rng, scored, temp) {
    const max = Math.max(...scored.map((s) => s.score));
    const weights = scored.map((s) => Math.exp((s.score - max) / temp));
    const total = weights.reduce((a, b) => a + b, 0);
    const probs = weights.map((x) => x / total);
    let r = rng(), i = 0;
    while (i < probs.length - 1 && r >= probs[i]) { r -= probs[i]; i++; }
    return { id: scored[i].id, candidates: scored.map((s, j) => ({ id: s.id, score: +s.score.toFixed(3), p: +probs[j].toFixed(3) })).sort((a, b) => b.p - a.p) };
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  M.newSeed = () => Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  M.defaultContext = () => ({ urgency: 0.6, expertise: 0.6, autonomy: 0.45, entropy: 0.8, device: 'desktop' });

  /* ---------- Dimension scoring ---------- */
  function scoreInteraction(c, risk) {
    return [
      ['direct', 0.65 + c.expertise * 0.45 + (c.device === 'desktop' ? 0.1 : 0)],
      ['guided', 0.35 + (1 - c.expertise) * 1.05 + (c.device === 'handheld' ? 0.25 : 0)],
      ['conversational', 0.25 + (1 - c.expertise) * 0.35 + c.autonomy * 0.35 + (c.device === 'handheld' ? 0.3 : 0)],
      ['command', -0.05 + c.expertise * 1.05 + c.urgency * 0.25 - (c.device === 'handheld' ? 0.6 : 0)],
      ['supervisory', c.autonomy * 1.5 - risk * 0.15 + (c.device === 'wall' ? 0.25 : 0)],
      ['mixed', 0.4 + c.autonomy * 0.55 + c.expertise * 0.1]
    ].map(([id, score]) => ({ id, score }));
  }
  const NAV_FOR = {
    direct: ['rail', 'tabs', 'hub', 'dock', 'timeline'],
    guided: ['stepper', 'timeline'],
    conversational: ['thread'],
    command: ['palette', 'tabs'],
    supervisory: ['rail', 'timeline', 'dock'],
    mixed: ['rail', 'tabs', 'timeline', 'hub', 'dock']
  };
  function scoreNav(id, c, screens) {
    const base = { rail: 0.7, tabs: 0.65, stepper: 0.8, hub: 0.55, palette: 0.8, timeline: 0.65, dock: 0.5, anchors: 1, thread: 1 }[id];
    let s = base;
    if (id === 'rail' && c.device === 'handheld') s -= 0.7;
    if (id === 'dock' && (c.device === 'handheld' || c.device === 'tablet')) s += 0.4;
    if (id === 'hub') s += screens >= 3 ? 0.25 : -0.3;
    if (id === 'hub' && c.urgency > 0.7) s -= 0.4;
    if (id === 'tabs' && screens > 4) s -= 0.3;
    return s;
  }
  function scorePartition(c, interaction) {
    return [
      ['single', 0.45 + (c.device === 'wall' ? 0.9 : 0) + c.urgency * 0.45 - (c.device === 'handheld' ? 0.8 : 0) - (interaction === 'guided' ? 1.2 : 0)],
      ['cluster', 0.75 + c.expertise * 0.15],
      ['perStep', 0.35 + (1 - c.expertise) * 0.6 + (c.device === 'handheld' ? 0.7 : 0) + (interaction === 'guided' ? 0.5 : 0)]
    ].map(([id, score]) => ({ id, score }));
  }
  function scoreTopology(c, risk) {
    return [
      ['linear', 0.6 + (1 - c.expertise) * 0.5 + risk * 0.1],
      ['fork', 0.45 + c.expertise * 0.3 + c.urgency * 0.2],
      ['loop', 0.4 + risk * 0.45],
      ['hub', 0.3 + c.expertise * 0.5 - c.urgency * 0.25],
      ['compressed', c.autonomy * 1.25 - 0.05]
    ].map(([id, score]) => ({ id, score }));
  }
  function scoreLayout(c, n, hasTriage, interaction) {
    const d = c.device;
    return [
      ['bento', 0.8 + (d === 'desktop' ? 0.2 : 0)],
      ['bsp', 0.5 + c.expertise * 0.4],
      ['masterDetail', 0.5 + (hasTriage ? 0.55 : -0.25)],
      ['hero', 0.5 + c.urgency * 0.6],
      ['wall', 0.15 + (d === 'wall' ? 0.95 : 0) + c.expertise * 0.35 + c.urgency * 0.3],
      ['feed', 0.25 + (1 - c.expertise) * 0.4 + (interaction === 'conversational' ? 0.6 : 0) + (d === 'handheld' ? 1 : 0)],
      ['lanes', 0.45 + (n >= 5 ? 0.35 : -0.2)],
      ['orbit', 0.3 + c.urgency * 0.2 + (n >= 4 ? 0.25 : -0.3)],
      ['pods', 0.3 + (n >= 5 ? 0.35 : -0.1) + (d === 'handheld' ? 0.5 : 0)],
      ['free', 0.7 + c.expertise * 0.1],
      ['radial', 0.45 + (n >= 4 ? 0.25 : -0.3) + (d === 'wall' ? 0.2 : 0)],
      ['spine', 0.5 + (1 - c.expertise) * 0.2],
      ['river', 0.5 + (n >= 4 ? 0.2 : -0.2)],
      ['cascade', 0.4 + c.expertise * 0.25]
    ].filter(([id]) => (d === 'handheld' ? ['feed', 'pods', 'river'].includes(id) : d === 'tablet' ? !['wall', 'orbit', 'radial', 'cascade'].includes(id) : true))
      .map(([id, score]) => ({ id, score }));
  }
  function scoreSkin(sector, c) {
    const ind = sector === 'industrial';
    return [
      ['hmi', ind ? 1 : 0.2], ['carbon', 0.65 + c.urgency * 0.35 + (ind ? 0.1 : 0)],
      ['blueprint', ind ? 0.6 : 0.5], ['ceramic', ind ? 0.15 : 1], ['signal', 0.5 + (c.device === 'wall' ? 0.35 : 0)],
      ['phosphor', ind ? 0.6 : 0.4], ['paper', ind ? 0.25 : 0.8], ['concrete', ind ? 0.55 : 0.5], ['aurora', ind ? 0.25 : 0.65], ['sodium', ind ? 0.7 : 0.25]
    ].map(([id, score]) => ({ id, score }));
  }

  /* ---------- Workflow synthesis ---------- */
  function buildWorkflow(pack, topology, ctx, rng, trace) {
    let groups = pack.steps.map((s) => [s]);
    if (topology === 'compressed') {
      const out = []; let i = 0;
      while (i < groups.length) {
        const cur = groups[i][0], nxt = groups[i + 1] && groups[i + 1][0];
        const mergeable = nxt && !cur.irreversible && !nxt.irreversible && out.length < 3;
        if (mergeable && rng() < 0.45 + ctx.autonomy * 0.5) { out.push([cur, nxt]); i += 2; } else { out.push([cur]); i += 1; }
      }
      groups = out;
      trace.push(`Agent absorbed ${pack.steps.length - groups.length} step boundaries, giving ${groups.length} workflow nodes.`);
    }
    const nodes = groups.map((g) => ({
      id: g.map((s) => s.id).join('+'), base: g.map((s) => s.id), verb: g.map((s) => s.verb).join(' + '),
      label: g.map((s) => s.label).join(', then '), caps: [...new Set(g.flatMap((s) => s.caps))],
      irreversible: g.some((s) => s.irreversible), actor: 'human', backTo: null, retryTo: null
    }));
    const nodeOf = (baseId) => nodes.find((n) => n.base.includes(baseId));
    const edges = [];
    const seq = (a, b, kind = 'seq') => edges.push({ from: a.id, to: b.id, kind });
    let shape = topology;
    if (topology === 'fork') {
      const opts = [];
      for (let i = 1; i < nodes.length - 2; i++) if (!nodes[i].irreversible && !nodes[i + 1].irreversible) opts.push(i);
      if (!opts.length) { shape = 'linear'; trace.push('No two adjacent steps can run in parallel, so the fork fell back to linear.'); } else {
        const k = opts[Math.floor(rng() * opts.length)];
        nodes.forEach((n, i) => {
          if (i === nodes.length - 1 || i === k || i === k + 1) return;
          if (i === k - 1) { seq(n, nodes[k], 'fork'); seq(n, nodes[k + 1], 'fork'); } else seq(n, nodes[i + 1]);
        });
        seq(nodes[k], nodes[k + 2], 'join'); seq(nodes[k + 1], nodes[k + 2], 'join');
        trace.push(`Parallelized ${nodes[k].verb} and ${nodes[k + 1].verb}.`);
      }
    } else if (topology === 'hub') {
      const gate = nodes.findIndex((n) => n.irreversible);
      const end = gate === -1 ? nodes.length - 1 : gate;
      if (end - 1 < 2) { shape = 'linear'; trace.push('Too few steps before the gate for a hub, so the workflow stayed linear.'); } else {
        for (let i = 1; i < end; i++) { seq(nodes[0], nodes[i], 'free'); seq(nodes[i], nodes[end], 'join'); }
        for (let i = end; i < nodes.length - 1; i++) seq(nodes[i], nodes[i + 1]);
        trace.push(`${nodes[0].verb} became the hub. ${end - 1} spoke steps can run in any order.`);
      }
    }
    if (shape === 'linear' || shape === 'loop' || shape === 'compressed') nodes.slice(0, -1).forEach((n, i) => seq(n, nodes[i + 1]));
    groups.forEach((g, i) => g.forEach((st) => {
      if (st.backTo && nodeOf(st.backTo) !== nodes[i]) { nodes[i].backTo = nodeOf(st.backTo).id; edges.push({ from: nodes[i].id, to: nodes[i].backTo, kind: 'reject' }); }
      if (st.retryTo && shape === 'loop' && nodeOf(st.retryTo) !== nodes[i]) { nodes[i].retryTo = nodeOf(st.retryTo).id; edges.push({ from: nodes[i].id, to: nodes[i].retryTo, kind: 'retry' }); }
    }));
    return { nodes, edges, shape };
  }

  /* ---------- Layout solvers: each builds a real container subtree from the same items ---------- */
  function makeLayouts(newId) {
    const box = (name, layout, children, extra) => Object.assign({ id: newId(), type: 'container', name, layout, children }, extra);
    const weight = (n) => (n.span || 4) * (n.h || 1);
    const familyOf = (n) => n.family || (n.children && n.children[0] && familyOf(n.children[0])) || 'record';
    return {
      bento(items, ctx, rng) {
        const cols = M.DEVICES[ctx.device].cols, kids = [];
        let row = [], used = 0;
        const flush = () => {
          if (!row.length) return;
          const slack = cols - used;
          row[rng() < 0.5 ? 0 : row.length - 1].place.cs += slack;
          const rs = Math.max(...row.map((n) => n.h || 1));
          row.forEach((n) => { n.place.rs = rs; kids.push(n); });
          row = []; used = 0;
        };
        items.forEach((n) => {
          const want = clamp(Math.round((n.span || 4) * (cols / 12) * (0.8 + rng() * 0.5)), Math.min(cols, Math.ceil((n.minPx || 220) / (M.DEVICES[ctx.device].px / cols))), cols);
          if (used + want > cols) flush();
          n.place = { cs: want, rs: n.h || 1 }; row.push(n); used += want;
        });
        flush();
        return box('Bento grid', { mode: 'grid', cols }, kids);
      },
      bsp(items, ctx, rng) {
        const split = (list, horizontal) => {
          if (list.length === 1) return list[0];
          const total = list.reduce((a, n) => a + weight(n), 0);
          let acc = 0, cut = 1;
          for (let i = 0; i < list.length - 1; i++) { acc += weight(list[i]); cut = i + 1; if (acc >= total * (0.38 + rng() * 0.24)) break; }
          const a = list.slice(0, cut), b = list.slice(cut);
          const wa = a.reduce((x, n) => x + weight(n), 0), wb = total - wa;
          const nextDir = rng() < 0.82 ? !horizontal : horizontal;
          const ca = split(a, nextDir), cb = split(b, nextDir);
          ca.grow = +(wa / total * 10).toFixed(1); cb.grow = +(wb / total * 10).toFixed(1);
          return box(horizontal ? 'Split, side by side' : 'Split, stacked', { mode: 'split', dir: horizontal ? 'row' : 'col' }, [ca, cb]);
        };
        return split(items, rng() < 0.7);
      },
      masterDetail(items, ctx, rng) {
        const idx = items.findIndex((n) => (n.caps || []).some((c) => c === 'triage' || c === 'inspect'));
        const pick = idx >= 0 ? idx : 0;
        const master = items[pick], rest = items.filter((_, i) => i !== pick);
        if (!rest.length) return master;
        master.grow = 4;
        const useTabs = rest.length > 2 && rng() < 0.5;
        const detail = box(useTabs ? 'Detail tabs' : 'Detail stack', useTabs ? { mode: 'tabs' } : { mode: 'stack' }, rest, { grow: 6 });
        return box('Master and detail', { mode: 'split', dir: 'row' }, [master, detail]);
      },
      hero(items) {
        const sorted = [...items].sort((a, b) => weight(b) - weight(a));
        const hero = sorted[0]; hero.grow = 7; hero.hero = true;
        const rest = items.filter((n) => n !== hero);
        if (!rest.length) return hero;
        const railN = Math.ceil(rest.length * 0.6);
        const rail = box('Satellite rail', { mode: 'stack' }, rest.slice(0, railN), { grow: 3 });
        const top = box('Focal row', { mode: 'split', dir: 'row' }, [hero, rail], { grow: 7 });
        if (rest.length === railN) return top;
        const strip = box('Satellite strip', { mode: 'split', dir: 'row' }, rest.slice(railN).map((n) => Object.assign(n, { grow: 1 })), { grow: 3 });
        return box('Focal layout', { mode: 'split', dir: 'col' }, [top, strip]);
      },
      wall(items) {
        const cols = Math.ceil(Math.sqrt(items.length * 1.7));
        const lastRow = items.length % cols;
        items.forEach((n, i) => { n.place = { cs: 1, rs: 1 }; if (lastRow && i === items.length - 1) n.place.cs = cols - lastRow + 1; });
        return box('Mission wall', { mode: 'grid', cols, fill: true }, items);
      },
      feed(items) {
        const groups = new Map();
        items.forEach((n) => { const k = n.forStep || 'Context'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
        const sections = [...groups.entries()].map(([k, kids]) => box(k, { mode: 'section' }, kids));
        return box('Narrative feed', { mode: 'feed' }, sections);
      },
      lanes(items) {
        const defs = [['Sense', ['sense', 'orient']], ['Decide', ['decide']], ['Act and record', ['act', 'record']]];
        const lanes = defs.map(([label, fams]) => box(label, { mode: 'lane' }, items.filter((n) => fams.includes(familyOf(n))))).filter((l) => l.children.length);
        return box('Sense, decide, act lanes', { mode: 'lanes' }, lanes);
      },
      orbit(items) {
        const sorted = [...items].sort((a, b) => weight(b) - weight(a));
        const hero = sorted[0]; hero.grow = 5; hero.hero = true;
        const rest = items.filter((n) => n !== hero);
        if (!rest.length) return hero;
        const left = [], right = [];
        rest.forEach((n, i) => (i % 2 ? right : left).push(n));
        const kids = [box('Left orbit', { mode: 'stack' }, left, { grow: 2.5 }), hero];
        if (right.length) kids.push(box('Right orbit', { mode: 'stack' }, right, { grow: 2.5 }));
        return box('Orbit', { mode: 'split', dir: 'row' }, kids);
      },
      /* Free field: irregular rows in continuous space, tied together by data wires. */
      free(items, ctx, rng) {
        let y = 4, i = 0;
        while (i < items.length) {
          const n = Math.min(items.length - i, 1 + Math.floor(rng() * 3));
          const row = items.slice(i, i + n); i += n;
          const rowH = Math.round(210 + rng() * 110) + (row.some((x) => (x.h || 1) > 1) ? 70 : 0);
          const weights = row.map(() => 0.6 + rng()), total = weights.reduce((a, b) => a + b, 0);
          let x = 1 + rng() * 3;
          const room = 100 - x - 1 - (n - 1) * 2.5;
          row.forEach((it, j) => {
            const width = (weights[j] / total) * room, drop = Math.round(rng() * 34);
            it.free = { l: +x.toFixed(1), w: +width.toFixed(1), t: y + drop, h: rowH - drop };
            x += width + 2.5;
          });
          y += rowH + 18;
        }
        const links = [];
        items.forEach((a, k) => items.slice(k + 1).forEach((b) => {
          const shared = (a.binds || []).some((v) => (b.binds || []).some((u) => u.split(/[.[]/)[0] === v.split(/[.[]/)[0]));
          if (shared || (a.forStep && a.forStep === b.forStep)) links.push([a.id, b.id]);
        }));
        return box('Free field', { mode: 'free', minH: y, links: links.slice(0, items.length + 2) }, items);
      },
      radial(items) {
        const sorted = [...items].sort((a, b) => weight(b) - weight(a));
        const hub = sorted[0]; hub.hero = true;
        const rest = items.filter((n) => n !== hub);
        const H = 214, slots = [[1, 0], [35, 0], [69, 0], [1, 1], [69, 1], [1, 2], [35, 2], [69, 2]];
        hub.free = { l: 33, w: 34, t: H + 4, h: H - 12 };
        rest.forEach((n, i) => {
          const [l, row] = i < slots.length ? slots[i] : [35, 3];
          n.free = { l, w: 30, t: row * H + 4, h: H - 12 };
        });
        const rows = rest.length > slots.length ? 4 : 3;
        return box('Hub and spokes', { mode: 'free', minH: rows * H + 8, links: rest.map((n) => [hub.id, n.id]) }, [hub, ...rest]);
      },
      cascade(items, ctx, rng) {
        const stepX = 5 + rng() * 5, stepY = 44 + Math.round(rng() * 18), w = 52 + rng() * 10;
        items.forEach((n, i) => { n.free = { l: +(1 + i * stepX).toFixed(1), w: +Math.min(w, 98 - i * stepX).toFixed(1), t: 4 + i * stepY, h: 330, z: i + 1 }; });
        return box('Cascading sheets', { mode: 'free', minH: 346 + (items.length - 1) * stepY, stacked: true, links: [] }, items);
      },
      spine(items) { return box('Workflow spine', { mode: 'spine' }, items); },
      river(items) { return box('Horizontal river', { mode: 'river' }, items); },
      pods(items, ctx) {
        const defs = [['Situation', ['sense', 'orient']], ['Analysis', ['decide']], ['Action', ['act']], ['Record', ['record']]];
        const pods = defs.map(([label, fams]) => {
          const kids = items.filter((n) => fams.includes(familyOf(n)));
          if (!kids.length) return null;
          return box(label + ' pod', kids.length > 1 ? { mode: 'tabs' } : { mode: 'stack' }, kids, { place: { cs: 1, rs: 1 } });
        }).filter(Boolean);
        return box('Tabbed pods', { mode: 'grid', cols: ctx.device === 'handheld' ? 1 : Math.min(2, pods.length), pods: true }, pods);
      }
    };
  }

  /* ---------- Main entry ---------- */
  M.plan = function (input) {
    const t0 = now();
    const seed = String(input.seed), locks = input.locks || {};
    const pack = M.PACKS.find((p) => p.id === input.goalId) || M.PACKS[0];
    const ctx = Object.assign(M.defaultContext(), input.ctx);
    const device = M.DEVICES[ctx.device];
    const temp = 0.07 + ctx.entropy * 0.85;
    const stages = [];
    const stage = (name, fn) => { const s = now(), lines = []; const out = fn(lines); stages.push({ name, lines, ms: +(now() - s).toFixed(3) }); return out; };
    const choose = (dim, scored, label) => {
      if (locks[dim] && M.DIMENSIONS[dim].options[locks[dim]]) return { id: locks[dim], locked: true, candidates: scored };
      return softmax(stream(seed, label || dim), scored, temp);
    };
    const describe = (dim, pick) => pick.locked
      ? `${M.DIMENSIONS[dim].label}: ${M.DIMENSIONS[dim].options[pick.id]} (locked by you).`
      : `${M.DIMENSIONS[dim].label}: ${M.DIMENSIONS[dim].options[pick.id]}, p=${pick.candidates.find((c) => c.id === pick.id).p}. Next best ${(pick.candidates.find((c) => c.id !== pick.id) || {}).id || 'none'}.`;
    const constraints = [];
    const rule = (id, label, status, detail) => constraints.push({ id, label, status, detail });
    let idc = 0; const newId = () => 'n' + (++idc);

    stage('Intent', (L) => {
      L.push(`Goal bound to the ${pack.domain} pack, risk class ${pack.risk.toFixed(2)}.`);
      if (input.goalNote) L.push(input.goalNote);
      L.push(`Exploration temperature ${temp.toFixed(2)}, from entropy ${ctx.entropy.toFixed(2)}.`);
    });

    let interactionPick;
    const interactionOut = stage('Interaction', (L) => {
      interactionPick = choose('interaction', scoreInteraction(ctx, pack.risk));
      L.push(describe('interaction', interactionPick));
      let id = interactionPick.id, repaired = null;
      if (ctx.expertise < 0.3 && id === 'command') {
        if (interactionPick.locked) rule('novice', 'Novices are not given command-only control', 'warn', 'Command mode is locked in with a novice operator. Kept as you asked.');
        else { id = 'guided'; repaired = 'Replaced command mode with a guided procedure for a novice operator.'; L.push('Repair: ' + repaired); rule('novice', 'Novices are not given command-only control', 'repaired', repaired); }
      } else rule('novice', 'Novices are not given command-only control', 'pass', 'Interaction model suits this expertise level.');
      return id;
    });
    let interaction = interactionOut;

    const topoPick = choose('topology', scoreTopology(ctx, pack.risk));
    const wf = stage('Workflow', (L) => {
      L.push(describe('topology', topoPick));
      const g = buildWorkflow(pack, topoPick.id, ctx, stream(seed, 'wfshape'), L);
      const rng = stream(seed, 'actors');
      const pAgent = clamp(ctx.autonomy * (interaction === 'supervisory' ? 1.15 : 0.85), 0, 0.95);
      let gated = 0;
      g.nodes.forEach((n) => {
        const r = rng();
        n.actor = r < pAgent ? 'agent' : r < pAgent + 0.2 ? 'joint' : 'human';
        if (n.irreversible && n.actor !== 'human') { n.actor = 'human'; gated++; }
      });
      const ag = g.nodes.filter((n) => n.actor === 'agent').length;
      L.push(`Actors assigned: ${ag} agent, ${g.nodes.filter((n) => n.actor === 'joint').length} joint, ${g.nodes.filter((n) => n.actor === 'human').length} human.`);
      if (gated) L.push('Repair: returned the irreversible step to a human.');
      rule('gate', 'Irreversible steps stay with a human', gated ? 'repaired' : 'pass', gated ? 'Sampling gave an irreversible step to the agent, so the planner returned it to a human.' : 'Every irreversible step already had a human actor.');
      return g;
    });

    const partPick = choose('partition', scorePartition(ctx, interaction));
    const screenPlan = stage('Partition', (L) => {
      L.push(describe('partition', partPick));
      const nodes = wf.nodes; let groups;
      if (partPick.id === 'single') groups = [nodes];
      else if (partPick.id === 'perStep') groups = nodes.map((n) => [n]);
      else {
        const rng = stream(seed, 'clusters');
        const k = Math.min(nodes.length, rng() < 0.5 ? 2 : 3);
        groups = []; const size = nodes.length / k; let acc = [];
        nodes.forEach((n, i) => { acc.push(n); if (acc.length >= size - rng() * 0.6 && groups.length < k - 1 && i < nodes.length - 1) { groups.push(acc); acc = []; } });
        if (acc.length) groups.push(acc);
      }
      L.push(`${nodes.length} workflow nodes map to ${groups.length} screen${groups.length > 1 ? 's' : ''}.`);
      return groups;
    });

    let navId = stage('Navigation', (L) => {
      const single = screenPlan.length === 1;
      let opts = NAV_FOR[interaction] || NAV_FOR.direct;
      if (single && interaction !== 'conversational') opts = ['anchors'];
      if (interaction === 'guided' && single) opts = ['stepper'];
      const pick = choose('nav', opts.map((id) => ({ id, score: scoreNav(id, ctx, screenPlan.length) })));
      L.push(describe('nav', pick));
      let id = pick.id;
      if (id === 'thread' && interaction !== 'conversational') {
        if (locks.interaction) { id = 'rail'; L.push('Repair: the agent thread needs conversational interaction, which is locked to something else, so the planner used a side rail.'); }
        else { interaction = 'conversational'; L.push('Locked agent thread changed interaction to conversational.'); }
      }
      return id;
    });

    /* Selection: cover each capability the screen's steps need, then enrich up to a budget. */
    const familyTarget = Math.max(2, Math.round(device.budget * (0.55 + ctx.expertise * 0.3 + ctx.urgency * 0.1)));
    const makeLeaf = (kind, why, forStep) => {
      const c = CAT[kind];
      return { id: newId(), type: 'widget', widget: kind, name: c.label, family: c.family, caps: c.caps, span: c.span, h: c.h, minPx: c.minPx, why, forStep, binds: bindingsOf(kind) };
    };
    const screens = stage('Widget selection', (L) => {
      const out = [];
      screenPlan.forEach((nodes, si) => {
        const rng = stream(seed, 'select' + si);
        const items = [];
        const covers = new Set();
        const used = {};
        const pick = (cap, step, source) => {
          const cands = M.CATALOG.filter((c) => !c.internal && c.caps.includes(cap) && (!c.sector || c.sector === pack.sector) && c.minPx <= device.px && !used[c.kind]);
          if (!cands.length) return null;
          const scored = cands.map((c) => ({
            id: c.kind,
            score: 1 + ctx.urgency * c.urgent * 0.6 + (ctx.expertise < 0.45 ? (0.45 - ctx.expertise) * c.novice * 2 : 0) + (ctx.expertise > 0.55 ? (ctx.expertise - 0.55) * c.dense * 2 : 0)
              + (ctx.device === 'handheld' || ctx.device === 'tablet' ? c.touch * 0.6 : 0) + ctx.autonomy * c.agent * 0.4 + (ctx.device === 'wall' ? c.dense * 0.3 : 0)
          }));
          const res = softmax(rng, scored, temp);
          const leaf = makeLeaf(res.id, { source, cap, step: step && step.verb, candidates: res.candidates }, step && step.verb);
          used[res.id] = 1;
          CAT[res.id].caps.forEach((x) => covers.add(x));
          items.push(leaf);
          return leaf;
        };
        nodes.forEach((n) => n.caps.forEach((cap) => { if (!covers.has(cap)) pick(cap, n, 'required'); }));
        const pool = ['monitor', 'trend', 'alert', 'compare', 'advise', 'audit', 'guide', 'inspect'];
        let guard = 0;
        const target = screenPlan.length === 1 ? device.budget : familyTarget;
        while (items.length < target && guard++ < 12) {
          const cap = pool[Math.floor(rng() * pool.length)];
          if (rng() < 0.35 + ctx.expertise * 0.5) pick(cap, null, 'enrichment');
        }
        out.push({ id: 's' + si, nodes: nodes.map((n) => n.id), title: nodes.map((n) => n.verb).join(' · '), items, covers });
        L.push(`${out[si].title}: ${items.map((x) => x.name).join(', ')}.`);
      });
      return out;
    });

    /* Validation runs on the sampled selection and repairs it where it can. */
    const shell = { alarmStrip: false };
    stage('Validation', (L) => {
      const needAlert = pack.risk >= 0.6;
      const lacking = screens.filter((s) => !s.covers.has('alert'));
      if (needAlert && lacking.length) {
        shell.alarmStrip = true;
        /* The pinned band now serves every screen, so a per-screen band would only repeat it. */
        screens.forEach((s) => { s.covers.add('alert'); if (s.items.length > 1) s.items = s.items.filter((n) => n.widget !== 'alarmband'); });
        const msg = `${lacking.length} screen${lacking.length > 1 ? 's' : ''} had no alarm surface, so the planner pinned an alarm band to the shell.`;
        rule('alarm', 'High-risk goals keep alarms in view', 'repaired', msg); L.push('Repair: ' + msg);
      } else rule('alarm', 'High-risk goals keep alarms in view', 'pass', needAlert ? 'Every screen already shows alarms.' : 'Risk class is below 0.60, so this rule does not bind.');

      let auditFix = 0;
      screens.forEach((s) => {
        const hasAgent = wf.nodes.some((n) => s.nodes.includes(n.id) && n.actor === 'agent');
        if (hasAgent && !s.covers.has('audit')) {
          s.items.push(makeLeaf('log', { source: 'repair', cap: 'audit', candidates: [{ id: 'log', score: 1, p: 1 }] }, 'Context'));
          s.covers.add('audit'); auditFix++;
        }
      });
      if (auditFix) L.push(`Repair: added an evidence log to ${auditFix} screen${auditFix > 1 ? 's' : ''} where the agent acts.`);
      rule('audit', 'Agent actions leave a visible record', auditFix ? 'repaired' : 'pass', auditFix ? `Added an evidence log to ${auditFix} screen${auditFix > 1 ? 's' : ''} where the agent acts.` : 'Screens with agent steps already show a log.');

      let guideFix = 0;
      if (ctx.expertise < 0.3) screens.forEach((s) => {
        const risky = wf.nodes.some((n) => s.nodes.includes(n.id) && n.irreversible);
        if (risky && !s.covers.has('guide')) {
          s.items.push(makeLeaf('sop', { source: 'repair', cap: 'guide', candidates: [{ id: 'sop', score: 1, p: 1 }] }, 'Context'));
          s.covers.add('guide'); guideFix++;
        }
      });
      rule('guide', 'Novices see the procedure at irreversible steps', guideFix ? 'repaired' : 'pass', guideFix ? 'Added the procedure reference beside the gate.' : ctx.expertise < 0.3 ? 'The procedure is already beside the gate.' : 'Expertise is above the novice line, so this rule does not bind.');

      const missing = [];
      screens.forEach((s) => wf.nodes.filter((n) => s.nodes.includes(n.id)).forEach((n) => n.caps.forEach((c) => { if (!s.covers.has(c)) missing.push(`${n.verb}/${c}`); })));
      rule('coverage', 'Each step has the capabilities it needs', missing.length ? 'fail' : 'pass', missing.length ? 'Uncovered: ' + missing.join(', ') : `All ${wf.nodes.reduce((a, n) => a + n.caps.length, 0)} capability demands are covered.`);

      const out = {}; wf.edges.filter((e) => e.kind !== 'reject' && e.kind !== 'retry').forEach((e) => { (out[e.from] = out[e.from] || []).push(e.to); });
      const seen = new Set([wf.nodes[0].id]); const st = [wf.nodes[0].id];
      while (st.length) (out[st.pop()] || []).forEach((t) => { if (!seen.has(t)) { seen.add(t); st.push(t); } });
      const lastOk = seen.has(wf.nodes[wf.nodes.length - 1].id);
      rule('reach', 'Every step is reachable and the goal can finish', seen.size === wf.nodes.length && lastOk ? 'pass' : 'fail', `${seen.size} of ${wf.nodes.length} steps reachable from the start.`);

      const tooWide = screens.flatMap((s) => s.items).filter((n) => n.minPx > device.px);
      rule('fit', 'Widgets fit the target device', tooWide.length ? 'fail' : 'pass', tooWide.length ? tooWide.map((n) => n.name).join(', ') : `All widgets fit ${device.px}px.`);
    });

    /* Layout: the same items produce very different hierarchies under each strategy. */
    const layouts = makeLayouts(newId);
    const skinPick = choose('skin', scoreSkin(pack.sector, ctx));
    let podded = 0;
    const screenNodes = stage('Layout', (L) => {
      const primary = choose('layout', scoreLayout(ctx, screens[0].items.length, screens[0].covers.has('triage'), interaction));
      L.push(describe('layout', primary));
      return screens.map((s, si) => {
        const rng = stream(seed, 'layout' + si);
        let strat = primary.id;
        const opts = scoreLayout(ctx, s.items.length, s.covers.has('triage'), interaction);
        if (!primary.locked && si > 0 && rng() < 0.3) strat = softmax(rng, opts, temp).id;
        if (!opts.some((o) => o.id === strat) && !primary.locked) strat = opts[0].id;
        if (primary.locked && ctx.device === 'handheld' && !opts.some((o) => o.id === strat)) strat = 'feed';
        let items = s.items.slice();
        if (items.length > device.budget) {
          const keep = device.budget - 1;
          const surplus = items.slice(keep);
          podded += surplus.length;
          items = items.slice(0, keep);
          items.push({ id: newId(), type: 'container', name: 'Overflow pod', layout: { mode: 'tabs' }, children: surplus, span: 6, h: 2, minPx: 260, family: surplus[0].family, forStep: 'Context' });
        }
        const root = layouts[strat](items, ctx, rng);
        if (strat !== primary.id) L.push(`${s.title} switched to ${M.DIMENSIONS.layout.options[strat]}.`);
        return { id: s.id, type: 'screen', name: s.title, nodes: s.nodes, strategy: strat, children: [root] };
      });
    });
    rule('density', 'Visible widgets stay within the device budget', podded ? 'repaired' : 'pass', podded ? `Moved ${podded} widgets into an overflow pod to stay within ${device.budget} per screen.` : `All screens are within ${device.budget} visible widgets.`);

    const compPick = choose('composition', Object.keys(M.DIMENSIONS.composition.options).map((id) => ({ id, score: 1 + (id === 'bench' || id === 'theatre' ? (ctx.device === 'wall' ? 0.3 : 0) : 0) })));
    const page = stage('Page', (L) => {
      const out = M.planPage(compPick.id, stream(seed, 'page'));
      L.push(describe('composition', compPick));
      L.push(`Controls appear as a ${out.dock.form} at ${out.dock.pos}. Page changes with a ${out.motion} transition.`);
      L.push(describe('skin', skinPick));
      return out;
    });

    /* Hub navigation adds a launch screen with its own content. */
    if (navId === 'hub') {
      const pad = makeLeaf('launchpad', { source: 'navigation', cap: 'navigate', candidates: [{ id: 'launchpad', score: 1, p: 1 }] });
      const kpi = makeLeaf('kpi', { source: 'navigation', cap: 'monitor', candidates: [{ id: 'kpi', score: 1, p: 1 }] });
      screenNodes.unshift({ id: 'overview', type: 'screen', name: 'Overview', nodes: [], strategy: 'stack', hub: true, children: [{ id: newId(), type: 'container', name: 'Overview stack', layout: { mode: 'stack' }, children: [kpi, pad] }] });
    }

    /* Shell: chrome placement is part of the plan too. */
    const rngShell = stream(seed, 'shell');
    shell.nav = navId;
    shell.header = ctx.device === 'handheld' || rngShell() < 0.35 ? 'compact' : 'full';
    shell.surface = interaction;
    shell.surfaceSide = interaction === 'conversational' || interaction === 'supervisory' ? (rngShell() < 0.75 ? 'right' : 'left') : (rngShell() < 0.6 ? 'bottom' : 'top');
    if (navId === 'rail' && shell.surfaceSide === 'left') shell.surfaceSide = 'right';
    shell.density = ctx.device === 'wall' || ctx.expertise > 0.78 ? 'compact' : ctx.expertise < 0.3 || ctx.device === 'handheld' ? 'roomy' : 'regular';

    const chrome = [];
    chrome.push({ id: newId(), type: 'chrome', name: shell.header === 'full' ? 'App bar' : 'Compact app bar', slot: 'header', family: null });
    if (shell.alarmStrip) chrome.push({ id: newId(), type: 'chrome', name: 'Pinned alarm band', slot: 'alarm', family: 'sense', caps: ['alert'], why: { source: 'repair', cap: 'alert', candidates: [{ id: 'alarmband', score: 1, p: 1 }] } });
    if (navId !== 'thread' && navId !== 'anchors') chrome.push({ id: newId(), type: 'chrome', name: M.DIMENSIONS.nav.options[navId] + ' nav', slot: 'nav', family: null });
    const surfaceNames = { direct: 'Step action bar', guided: 'Procedure footer', conversational: 'Agent thread', command: 'Command line', supervisory: 'Supervision queue', mixed: 'Agent proposal bar' };
    chrome.push({ id: newId(), type: 'chrome', name: surfaceNames[interaction], slot: 'surface', family: null });
    const viewport = { id: newId(), type: 'viewport', name: navId === 'anchors' ? 'Scrolling surface' : 'Screen viewport', children: screenNodes };
    const tree = { id: 'root', type: 'shell', name: pack.app, children: [...chrome, viewport] };

    const plan = {
      seed, goalId: pack.id, goal: input.goalText || pack.goal, ctx, locks: { ...locks },
      strategy: { interaction, nav: navId, topology: wf.shape, partition: partPick.id, layout: screenNodes.find((s) => !s.hub).strategy, skin: skinPick.id, composition: compPick.id },
      identity: M.planIdentity(skinPick.id, stream(seed, 'identity')), page,
      pageTree: M.pageTree(page),
      workflow: { nodes: wf.nodes, edges: wf.edges },
      shell, tree, screens: screenNodes.map((s) => s.id), constraints, stages
    };
    plan.metrics = M.measure(plan, device);
    plan.metrics.planMs = +(now() - t0).toFixed(2);
    return plan;
  };

  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  function bindingsOf(kind) {
    return { kpi: ['metrics[]'], gauge: ['metrics[]'], trend: ['metrics[0].history'], multitrend: ['metrics[].history'], alarms: ['alarms[]'], alarmband: ['alarms[0]'], mimic: ['entities[].status'], floor: ['entities[].status'], heat: ['entities[].n'], causes: ['causes'], table: ['entities[]', 'selection'], board: ['entities[].status', 'selection'], cards: ['entities[]', 'selection'], detail: ['selection'], bars: ['entities[].n', 'selection'], risk: ['entities[].n'], gantt: ['workflow.nodes'], advisor: ['recs[]'], scenario: ['recs[]', 'decision'], control: ['control.setpoint'], actions: ['actions[]', 'events'], form: ['form[]', 'events'], checklist: ['checklist[]'], readiness: ['metrics[]', 'checklist[]'], approval: ['gate', 'workflow.focus'], signoff: ['gate', 'workflow.focus'], log: ['events[]'], sop: ['sop[]'], launchpad: ['workflow.nodes'] }[kind] || [];
  }

  /* ---------- Metrics: all computed from the plan itself ---------- */
  M.walk = function walk(node, fn, depth = 0, parent = null) {
    fn(node, depth, parent);
    (node.children || []).forEach((c) => walk(c, fn, depth + 1, node));
  };
  M.measure = function (plan, device) {
    let nodes = 0, widgets = 0, containers = 0, depth = 0, breadth = 0;
    const kinds = new Set();
    M.walk(plan.tree, (n, d) => {
      nodes++; depth = Math.max(depth, d); breadth = Math.max(breadth, (n.children || []).length);
      if (n.type === 'widget') { widgets++; kinds.add(n.widget); }
      if (n.type === 'container') containers++;
    });
    const wfn = plan.workflow.nodes;
    const actionCost = { direct: 1, guided: 1, conversational: 1, command: 2, supervisory: 1, mixed: 1 }[plan.strategy.interaction];
    let ops = 0;
    wfn.forEach((n) => {
      if (n.actor === 'agent' && !n.irreversible) return;
      ops += n.irreversible ? 2 : actionCost;
    });
    const navCost = { rail: 1, tabs: 1, stepper: 1, hub: 2, palette: 2, timeline: 1, dock: 1, anchors: 0, thread: 0 }[plan.strategy.nav];
    const screenCount = plan.screens.length;
    return {
      nodes, widgets, containers, depth, breadth, kinds: kinds.size, screens: screenCount,
      perScreen: +(widgets / screenCount).toFixed(1),
      density: +(widgets / screenCount / device.budget).toFixed(2),
      steps: wfn.length, edges: plan.workflow.edges.length,
      agentShare: +(wfn.filter((n) => n.actor === 'agent').length / wfn.length).toFixed(2),
      operatorActions: ops, navOverhead: Math.max(0, screenCount - 1) * navCost,
      repairs: plan.constraints.filter((c) => c.status === 'repaired').length
    };
  };

  function shingles(plan) {
    const set = new Set();
    const tok = (n) => (n.type === 'widget' ? n.widget : n.layout ? n.layout.mode + (n.layout.dir || '') : n.type === 'chrome' ? n.name : n.type);
    M.walk(plan.tree, (n, d, p) => { if (p) set.add(tok(p) + '>' + tok(n)); });
    return set;
  }
  function widgetSet(plan) { const s = {}; M.walk(plan.tree, (n) => { if (n.type === 'widget') s[n.widget] = (s[n.widget] || 0) + 1; }); return s; }

  /* Structural distance between two plans: half tree-shingle distance, half strategy change. */
  M.distance = function (a, b) {
    const sa = shingles(a), sb = shingles(b);
    const inter = [...sa].filter((x) => sb.has(x)).length;
    const jaccard = 1 - inter / (sa.size + sb.size - inter || 1);
    const changes = Object.keys(a.strategy).filter((k) => a.strategy[k] !== b.strategy[k])
      .map((k) => ({ dim: k, from: M.DIMENSIONS[k].options[a.strategy[k]], to: M.DIMENSIONS[k].options[b.strategy[k]] }));
    const wa = widgetSet(a), wb = widgetSet(b);
    const added = Object.keys(wb).filter((k) => !wa[k]);
    const removed = Object.keys(wa).filter((k) => !wb[k]);
    return { novelty: +(jaccard * 0.5 + (changes.length / Object.keys(M.DIMENSIONS).length) * 0.5).toFixed(2), jaccard: +jaccard.toFixed(2), changes, added, removed, sameGoal: a.goalId === b.goalId };
  };

  /* ---------- Workflow state: derived from the set of finished base steps, so it survives replanning ---------- */
  M.wfStatus = function (plan, doneBase) {
    const status = {};
    const isDone = (n) => n.base.every((b) => doneBase.has(b));
    const fwd = plan.workflow.edges.filter((e) => e.kind !== 'reject' && e.kind !== 'retry');
    plan.workflow.nodes.forEach((n) => {
      if (isDone(n)) { status[n.id] = 'done'; return; }
      const preds = fwd.filter((e) => e.to === n.id).map((e) => plan.workflow.nodes.find((x) => x.id === e.from));
      status[n.id] = preds.every(isDone) ? 'active' : 'pending';
    });
    return status;
  };
})(typeof window !== 'undefined' ? (window.Morphogen = window.Morphogen || {}) : (globalThis.Morphogen = globalThis.Morphogen || {}));
