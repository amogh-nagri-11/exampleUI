/* Evolution: variation, selection and inheritance over whole-page designs.
   A genome holds the strategy choices plus the seeds of each decision stream, so a child
   reproduces its parent exactly except where it was mutated. Fitness comes from simulated
   operators. The model is a set of stated heuristics, not something validated with users. */
(function (M) {
  M.GENE_DIMS = ['interaction', 'topology', 'partition', 'layout', 'skin', 'composition'];
  M.GENE_STREAMS = { wfshape: 'Workflow detail', actors: 'Agent assignment', clusters: 'Screen grouping', nav: 'Navigation draw', select: 'Widget choice', layout: 'Layout detail', shell: 'Chrome placement', identity: 'Colour and type', page: 'Instrument placement' };
  const STREAM_KEYS = Object.keys(M.GENE_STREAMS);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const seedFrom = (rng) => Math.floor(rng() * 0xffffff).toString(16).padStart(6, '0');
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];

  M.genomeOf = (plan) => ({ seed: plan.seed, dims: Object.fromEntries(M.GENE_DIMS.map((d) => [d, plan.strategy[d]])), streams: {} });
  M.planFromGenome = (input, g) => M.plan(Object.assign({}, input, { seed: g.seed, fixed: g.dims, genes: g.streams }));
  M.genomeKey = (g) => JSON.stringify([g.seed, M.GENE_DIMS.map((d) => g.dims[d]), STREAM_KEYS.map((k) => g.streams[k] || '')]);
  const clone = (g) => ({ seed: g.seed, dims: { ...g.dims }, streams: { ...g.streams } });

  function allowed(dim, value, device) {
    if (dim !== 'layout') return true;
    if (device === 'handheld') return ['feed', 'pods', 'river'].includes(value);
    if (device === 'tablet') return !['wall', 'orbit', 'radial', 'cascade'].includes(value);
    return true;
  }
  /* Changes `count` genes. Dimensions you hold fixed are never mutated. */
  M.mutate = function (g, rng, count, locks, device) {
    const out = clone(g), changes = [];
    const dims = M.GENE_DIMS.filter((d) => !(locks && locks[d]));
    for (let k = 0; k < count; k++) {
      if (dims.length && rng() < 0.55) {
        const d = pick(rng, dims);
        const opts = Object.keys(M.DIMENSIONS[d].options).filter((o) => o !== out.dims[d] && allowed(d, o, device));
        if (!opts.length) continue;
        const to = pick(rng, opts);
        changes.push(`${M.DIMENSIONS[d].label}: ${M.DIMENSIONS[d].options[out.dims[d]] || out.dims[d]} → ${M.DIMENSIONS[d].options[to]}`);
        out.dims[d] = to;
      } else {
        const key = pick(rng, STREAM_KEYS);
        out.streams[key] = seedFrom(rng);
        changes.push(`New ${M.GENE_STREAMS[key].toLowerCase()}`);
      }
    }
    return { genome: out, changes };
  };
  /* Uniform crossover: each gene comes from one parent or the other. */
  M.crossover = function (a, b, rng) {
    const g = { seed: rng() < 0.5 ? a.seed : b.seed, dims: {}, streams: {} };
    M.GENE_DIMS.forEach((d) => { g.dims[d] = rng() < 0.5 ? a.dims[d] : b.dims[d]; });
    STREAM_KEYS.forEach((k) => {
      const src = rng() < 0.5 ? a : b;
      /* An absent stream gene means "use the parent's seed", so make it explicit before mixing. */
      const val = src.streams[k] || (src.seed !== g.seed ? src.seed : null);
      if (val) g.streams[k] = val;
    });
    return g;
  };

  /* ---------- Simulated operators ---------- */
  const NAV = { rail: (s) => 0.8, tabs: (s) => 0.8, stepper: (s) => 0.4, hub: (s) => 1.9 - 0.4 * s, palette: (s) => 2.4 - 1.5 * s, timeline: (s) => 1, dock: (s) => 1, anchors: (s) => 0.6, thread: (s) => 0.4 };
  const ACT = { direct: (s) => 1.2, guided: (s) => 1, conversational: (s) => 2, command: (s) => 3 - 2.4 * s, supervisory: (s) => 0.8, mixed: (s) => 1.3 };
  const ERR = { direct: 1, guided: 0.7, conversational: 1, command: 2.2, supervisory: 1.1, mixed: 1 };

  function screensOf(plan) {
    const vp = plan.tree.children.find((c) => c.type === 'viewport');
    return vp.children.map((s) => {
      const widgets = [];
      const collect = (n, hidden) => {
        if (n.type === 'widget') { widgets.push({ kind: n.widget, caps: n.caps, hidden }); return; }
        const tabs = n.layout && n.layout.mode === 'tabs';
        (n.children || []).forEach((c, i) => collect(c, hidden || (tabs && i > 0)));
      };
      s.children.forEach((c) => collect(c, false));
      return { id: s.id, nodes: s.nodes, hub: s.hub, widgets, visible: widgets.filter((w) => !w.hidden).length };
    });
  }

  /* One operator, one run. Returns time in seconds split by where it went. */
  function runOnce(plan, screens, skill, device, rng) {
    const nodes = plan.workflow.nodes, nav = plan.strategy.nav, act = plan.strategy.interaction;
    const touch = device === 'handheld' || device === 'tablet';
    const t = { nav: 0, search: 0, read: 0, act: 0, errors: 0, agent: 0 };
    let errors = 0, cur = screens[0].hub ? 'overview' : null;
    const guideOn = (sc) => sc.widgets.some((w) => w.caps.includes('guide'));
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const sc = screens.find((x) => x.nodes.includes(node.id));
      if (cur !== sc.id) { if (cur !== null) t.nav += NAV[nav](skill); cur = sc.id; }
      t.search += 0.7 * Math.log2(sc.visible + 1) * (1.35 - skill);
      if (node.actor === 'agent' && !node.irreversible) {
        t.agent += 0.9;
        if (rng() < 0.04) { t.errors += 6; errors++; }
        continue;
      }
      node.caps.forEach((cap) => {
        const w = sc.widgets.find((x) => x.caps.includes(cap));
        if (!w) { t.read += 8; return; }
        const c = M.catalogByKind[w.kind];
        t.read += 0.6 + c.dense * 1.1 * (1 - skill) + (1 - skill) * (1 - c.novice) * 1.5 + skill * (1 - c.dense) * 0.4;
        if (w.hidden) t.read += 0.9;
        if (touch) t.read += (1 - c.touch) * 1.2;
      });
      t.act += ACT[act](skill) * (node.irreversible ? 2 : 1);
      let p = (0.03 + (1 - skill) * 0.09) * ERR[act];
      p += Math.max(0, sc.visible / M.DEVICES[device].budget - 1) * 0.08;
      if (node.irreversible && skill < 0.35 && !guideOn(sc)) p += 0.15;
      if (rng() < p) {
        errors++;
        t.errors += 5 + 4 * (1 - skill);
        if (node.irreversible && node.backTo) {
          const back = nodes.findIndex((x) => x.id === node.backTo);
          t.errors += Math.max(0, i - back) * 3;
        }
      }
      if (errors >= 4) return { t, total: sum(t), errors, done: false };
    }
    const total = sum(t);
    return { t, total, errors, done: total < 600 };
  }
  const sum = (t) => Object.values(t).reduce((a, b) => a + b, 0);

  /* Fitness: mean over runs of 100 × 60 / (60 + seconds) for completed runs, 0 otherwise.
     100 would be instant; 50 means a minute. Three operators at expertise −0.25, 0 and +0.25,
     three runs each, all with the same random draws so that designs are compared fairly. */
  M.simulate = function (plan, ctx, evalSeed) {
    if (plan.constraints.some((c) => c.status === 'fail')) return { fitness: 0, failed: true, personas: [], parts: {} };
    const screens = screensOf(plan);
    const personas = [-0.25, 0, 0.25].map((o) => clamp(ctx.expertise + o, 0.02, 0.98));
    const parts = { nav: 0, search: 0, read: 0, act: 0, errors: 0, agent: 0 };
    let score = 0, runs = 0;
    const out = personas.map((skill, pi) => {
      let time = 0, errs = 0, done = 0;
      for (let r = 0; r < 3; r++) {
        const res = runOnce(plan, screens, skill, ctx.device, M.stream(evalSeed, `p${pi}r${r}`));
        runs++; time += res.total; errs += res.errors; done += res.done ? 1 : 0;
        score += res.done ? (100 * 60) / (60 + res.total) : 0;
        Object.keys(parts).forEach((k) => { parts[k] += res.t[k]; });
      }
      return { skill: +skill.toFixed(2), time: +(time / 3).toFixed(1), errors: +(errs / 3).toFixed(1), done };
    });
    Object.keys(parts).forEach((k) => { parts[k] = +(parts[k] / runs).toFixed(1); });
    return { fitness: +(score / runs).toFixed(1), personas: out, parts };
  };

  /* ---------- Population ---------- */
  function individual(evo, genome, born, parents, changes) {
    const plan = M.planFromGenome(evo.input, genome);
    const sim = M.simulate(plan, evo.input.ctx, evo.evalSeed);
    return { id: 'i' + (++evo.ids), genome, plan, fit: sim.fitness, sim, born, parents, changes };
  }
  M.newEvolution = function (plan, input, opts) {
    const o = Object.assign({ size: 8, elites: 3, seed: 'evo' }, opts);
    const evo = { input: Object.assign({}, input, { ctx: Object.assign(M.defaultContext(), input.ctx), locks: { ...(input.locks || {}) } }), size: o.size, elites: o.elites, evalSeed: o.seed + '|eval', rngSeed: o.seed, gen: 0, ids: 0, explore: 1, stale: 0, seen: new Set(), history: [], log: [], converged: false };
    const base = individual(evo, M.genomeOf(plan), 0, [], ['Starting design']);
    evo.seen.add(M.genomeKey(base.genome));
    evo.pop = [base];
    const rng = M.stream(evo.rngSeed, 'init');
    for (let guard = 0; evo.pop.length < evo.size && guard < 60; guard++) {
      const m = M.mutate(base.genome, rng, 1 + (rng() < 0.6 ? 1 : 0), evo.input.locks, evo.input.ctx.device);
      const key = M.genomeKey(m.genome);
      if (evo.seen.has(key) || !m.changes.length) continue;
      evo.seen.add(key);
      evo.pop.push(individual(evo, m.genome, 0, [base.id], m.changes));
    }
    evo.pop.sort((a, b) => b.fit - a.fit);
    evo.bestFit = evo.pop[0].fit;
    evo.history.push(stats(evo));
    return evo;
  };
  function stats(evo) {
    const fits = evo.pop.map((x) => x.fit);
    return { gen: evo.gen, best: Math.max(...fits), mean: +(fits.reduce((a, b) => a + b, 0) / fits.length).toFixed(1), explore: +evo.explore.toFixed(2) };
  }
  /* One generation: keep the elites, breed the rest by mutation or crossover. */
  M.evolveStep = function (evo) {
    const rng = M.stream(evo.rngSeed, 'gen' + evo.gen);
    evo.gen++;
    const ranked = [...evo.pop].sort((a, b) => b.fit - a.fit);
    const elites = ranked.slice(0, evo.elites);
    const children = [];
    for (let guard = 0; children.length < evo.size - elites.length && guard < 80; guard++) {
      let genome, parents, changes;
      if (elites.length > 1 && rng() < 0.3) {
        const a = pick(rng, elites), b = pick(rng, elites.filter((x) => x !== a));
        genome = M.crossover(a.genome, b.genome, rng); parents = [a.id, b.id]; changes = ['Crossover'];
        if (rng() < evo.explore) { const m = M.mutate(genome, rng, 1, evo.input.locks, evo.input.ctx.device); genome = m.genome; changes = changes.concat(m.changes); }
      } else {
        const x = pick(rng, ranked), y = pick(rng, ranked), parent = x.fit >= y.fit ? x : y;
        const n = 1 + (rng() < evo.explore ? 1 : 0) + (rng() < evo.explore * 0.5 ? 1 : 0);
        const m = M.mutate(parent.genome, rng, n, evo.input.locks, evo.input.ctx.device);
        genome = m.genome; parents = [parent.id]; changes = m.changes;
      }
      const key = M.genomeKey(genome);
      if (evo.seen.has(key)) continue;
      evo.seen.add(key);
      children.push(individual(evo, genome, evo.gen, parents, changes));
    }
    evo.pop = [...elites, ...children].sort((a, b) => b.fit - a.fit);
    const best = evo.pop[0];
    if (best.fit > evo.bestFit + 0.05) {
      evo.log.unshift({ gen: evo.gen, from: evo.bestFit, to: best.fit, changes: best.changes });
      evo.bestFit = best.fit; evo.stale = 0; evo.explore = Math.min(1, evo.explore + 0.05);
    } else { evo.stale++; evo.explore = Math.max(0.1, evo.explore * 0.85); }
    evo.converged = evo.stale >= 10 && evo.explore <= 0.12;
    evo.history.push(stats(evo));
    return evo;
  };
})(typeof window !== 'undefined' ? (window.Morphogen = window.Morphogen || {}) : (globalThis.Morphogen = globalThis.Morphogen || {}));
