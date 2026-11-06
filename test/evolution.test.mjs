import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/packs.js';
import '../src/planner.js';
import '../src/page-plan.js';
import '../src/evolution.js';

const M = globalThis.Morphogen;
const same = (a, b) => JSON.stringify([a.strategy, a.tree, a.page, a.workflow, a.identity.appVars]) === JSON.stringify([b.strategy, b.tree, b.page, b.workflow, b.identity.appVars]);

test('a genome reproduces its design exactly', () => {
  for (let i = 0; i < 300; i++) {
    const input = { goalId: M.PACKS[i % 8].id, ctx: { device: ['wall', 'desktop', 'tablet', 'handheld'][i % 4], expertise: (i % 5) / 4 } };
    const p = M.plan({ ...input, seed: `g${i}` });
    assert.ok(same(p, M.planFromGenome(input, M.genomeOf(p))), `seed g${i} did not reproduce`);
  }
});

test('a mutation changes only what it reports', () => {
  const input = { goalId: 'incident', ctx: {} };
  const p = M.plan({ ...input, seed: 'm1' }), g = M.genomeOf(p);
  let rng = M.stream('t', 'mut');
  for (let i = 0; i < 100; i++) {
    const { genome, changes } = M.mutate(g, rng, 1, {}, 'desktop');
    const child = M.planFromGenome(input, genome);
    const dimChanges = M.GENE_DIMS.filter((d) => genome.dims[d] !== g.dims[d]);
    assert.ok(dimChanges.length + Object.keys(genome.streams).length === 1, 'one gene per mutation');
    for (const d of M.GENE_DIMS) if (!dimChanges.includes(d) && d !== 'layout' && d !== 'interaction') assert.equal(child.strategy[d], p.strategy[d], `${d} drifted after: ${changes}`);
  }
});

test('held variables never mutate', () => {
  const input = { goalId: 'grid', ctx: {}, locks: { layout: 'spine', skin: 'paper' } };
  const evo = M.newEvolution(M.plan({ ...input, seed: 'h' }), input, { seed: 'held' });
  for (let i = 0; i < 12; i++) M.evolveStep(evo);
  for (const ind of evo.pop) { assert.equal(ind.plan.strategy.layout, 'spine'); assert.equal(ind.plan.strategy.skin, 'paper'); }
});

test('fitness is deterministic, bounded, and zero for illegal designs', () => {
  const p = M.plan({ goalId: 'line', seed: 'f1', ctx: {} });
  const a = M.simulate(p, p.ctx, 'e'), b = M.simulate(p, p.ctx, 'e');
  assert.deepEqual(a, b);
  assert.ok(a.fitness > 0 && a.fitness < 100, String(a.fitness));
  const broken = { ...p, constraints: [...p.constraints, { id: 'x', status: 'fail' }] };
  assert.equal(M.simulate(broken, p.ctx, 'e').fitness, 0);
});

test('elitism: the best fitness never drops, and the search converges', () => {
  for (const goalId of ['refinery', 'procure', 'warehouse']) {
    const input = { goalId, ctx: { ...M.defaultContext(), expertise: 0.3 } };
    const evo = M.newEvolution(M.plan({ ...input, seed: 'start' }), input, { seed: goalId });
    const first = evo.bestFit;
    let last = first;
    for (let i = 0; i < 60 && !evo.converged; i++) {
      M.evolveStep(evo);
      assert.ok(evo.bestFit >= last, `best fell at gen ${evo.gen}`);
      last = evo.bestFit;
      assert.equal(evo.pop.length, evo.size);
    }
    assert.ok(evo.bestFit >= first);
    assert.ok(evo.converged, `${goalId} did not converge in 60 generations`);
    assert.ok(evo.explore <= 0.12);
  }
});

/* 0.32 sits just above the planner's novice rule, which would otherwise turn command into guided. */
test('the operator model points the expected way for novices', () => {
  const ctx = { ...M.defaultContext(), expertise: 0.32 };
  const mean = (interaction) => {
    let s = 0;
    for (let i = 0; i < 40; i++) {
      const p = M.plan({ goalId: 'refinery', seed: `n${i}`, ctx, fixed: { interaction } });
      s += M.simulate(p, ctx, 'nov').fitness;
    }
    return s / 40;
  };
  assert.ok(mean('guided') > mean('command') + 3, 'guided should beat command for novices');
});
