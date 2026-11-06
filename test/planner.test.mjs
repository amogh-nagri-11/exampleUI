import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/packs.js';
import '../src/planner.js';
import '../src/page-plan.js';

const M = globalThis.Morphogen;
const devices = Object.keys(M.DEVICES);
const levels = [0.05, 0.5, 0.95];

function* sweep() {
  let i = 0;
  for (const pack of M.PACKS) for (const device of devices) for (const autonomy of levels) for (const expertise of levels) {
    for (let k = 0; k < 4; k++) yield { goalId: pack.id, seed: `s${i++}`, ctx: { device, autonomy, expertise, urgency: levels[k % 3], entropy: 0.2 + k * 0.25 } };
  }
}
const stripTimes = (p) => JSON.stringify({ ...p, stages: p.stages.map((s) => ({ name: s.name, lines: s.lines })), metrics: { ...p.metrics, planMs: 0 } });

test('the same inputs always produce the same plan', () => {
  const input = { goalId: 'grid', seed: 'abc123', ctx: { device: 'wall' } };
  assert.equal(stripTimes(M.plan(input)), stripTimes(M.plan(input)));
});

test('hard constraints hold across the whole sweep', () => {
  let count = 0;
  for (const input of sweep()) {
    const p = M.plan(input);
    count++;
    const where = `${input.goalId}/${input.seed}`;
    assert.ok(!p.constraints.some((c) => c.status === 'fail'), `${where}: ${JSON.stringify(p.constraints.filter((c) => c.status === 'fail'))}`);
    for (const n of p.workflow.nodes) if (n.irreversible) assert.equal(n.actor, 'human', where);
    const baseIds = M.PACKS.find((x) => x.id === input.goalId).steps.map((s) => s.id).sort();
    assert.deepEqual(p.workflow.nodes.flatMap((n) => n.base).sort(), baseIds, `${where}: steps lost`);
    if (input.ctx.expertise < 0.3) assert.notEqual(p.strategy.interaction, 'command', where);
  }
  assert.ok(count > 1000);
});

test('widgets per screen and node ids stay valid', () => {
  for (const input of sweep()) {
    const p = M.plan(input);
    const ids = new Set();
    M.walk(p.tree, (n) => { assert.ok(!ids.has(n.id), `duplicate id ${n.id}`); ids.add(n.id); });
    const viewport = p.tree.children.find((c) => c.type === 'viewport');
    const budget = M.DEVICES[input.ctx.device].budget;
    for (const screen of viewport.children) {
      const kinds = [];
      let top = 0;
      const count = (n, inPod) => {
        if (n.type === 'widget') { kinds.push(n.widget); if (!inPod) top++; return; }
        const pod = n.name === 'Overflow pod';
        if (pod && !inPod) top++;
        (n.children || []).forEach((c) => count(c, inPod || pod));
      };
      count(screen, false);
      assert.equal(new Set(kinds).size, kinds.length, 'a widget kind repeats within a screen');
      assert.ok(top <= budget, `${top} visible widgets over budget ${budget}`);
    }
  }
});

test('workflow can always run to completion by finishing active steps', () => {
  for (const input of sweep()) {
    const p = M.plan(input);
    const done = new Set();
    for (let guard = 0; guard < 20; guard++) {
      const st = M.wfStatus(p, done);
      const active = p.workflow.nodes.filter((n) => st[n.id] === 'active');
      if (!active.length) break;
      active[0].base.forEach((b) => done.add(b));
    }
    const st = M.wfStatus(p, done);
    assert.ok(p.workflow.nodes.every((n) => st[n.id] === 'done'), `${input.goalId}/${input.seed} stalled`);
  }
});

test('regeneration produces real structural variety for one goal', () => {
  const plans = Array.from({ length: 40 }, (_, i) => M.plan({ goalId: 'refinery', seed: `v${i}`, ctx: {} }));
  for (const dim of Object.keys(M.DIMENSIONS)) {
    const seen = new Set(plans.map((p) => p.strategy[dim]));
    assert.ok(seen.size >= 3, `${dim} only produced ${[...seen]}`);
  }
  const d = M.distance(plans[0], plans[1]);
  assert.ok(d.novelty >= 0 && d.novelty <= 1);
});

test('locking a dimension holds it and leaves the workflow draw alone', () => {
  const free = M.plan({ goalId: 'incident', seed: 'lock1', ctx: {} });
  const locked = M.plan({ goalId: 'incident', seed: 'lock1', ctx: {}, locks: { layout: 'lanes', skin: 'blueprint' } });
  assert.equal(locked.strategy.layout, 'lanes');
  assert.equal(locked.strategy.skin, 'blueprint');
  assert.equal(locked.strategy.topology, free.strategy.topology);
  assert.equal(locked.strategy.interaction, free.strategy.interaction);
});

test('typed goals bind to a pack and adjust context', () => {
  const r = M.parseGoal('Urgent: novice operator must restore the feeder on a phone');
  assert.equal(r.pack.id, 'grid');
  assert.equal(r.ctx.urgency, 0.92);
  assert.equal(r.ctx.expertise, 0.12);
  assert.equal(r.ctx.device, 'handheld');
  assert.equal(M.parseGoal('zzz', 'close').matched, false);
});

test('every instrument is placed exactly once on every page', () => {
  for (let i = 0; i < 400; i++) {
    const p = M.plan({ goalId: M.PACKS[i % 8].id, seed: `pg${i}`, ctx: {} });
    const placed = p.page.regions.flatMap((r) => r.modules).sort();
    assert.deepEqual(placed, Object.keys(M.MODULES).sort(), `${p.seed} ${p.page.composition}`);
    assert.ok(p.page.grid.areas.join(' ').split(/\s+/).includes('app'), `${p.seed}: no app area`);
  }
});

test('generated colours stay legible for every identity', () => {
  for (const mood of Object.keys(M.DIMENSIONS.skin.options)) for (let i = 0; i < 60; i++) {
    const p = M.plan({ goalId: 'close', seed: `c${i}`, ctx: {}, locks: { skin: mood } });
    for (const pal of [p.identity.palettes.app, p.identity.palettes.host]) for (const back of [pal.bg, pal.panel, pal.panel2]) {
      const where = `${mood}/${i} on ${back}`;
      assert.ok(M.contrast(pal.fg, back) >= 7, `fg ${where}`);
      assert.ok(M.contrast(pal.mut, back) >= 4.5, `mut ${where}`);
      for (const k of ['accent', 'ok', 'warn', 'crit']) assert.ok(M.contrast(pal[k], back) >= 4.5, `${k} ${where}`);
    }
    assert.ok(M.contrast(p.identity.palettes.app.on, p.identity.palettes.app.accent) >= 4.5, `on-accent ${mood}/${i}`);
  }
});

test('consecutive regenerations always give a different page', () => {
  let n = 0, prev = null;
  const next = () => `seq${n++}`;
  const seen = {};
  for (let i = 0; i < 300; i++) {
    const p = M.planDistinct({ goalId: 'refinery', ctx: {} }, prev, next);
    if (prev) {
      assert.ok(!M.tooSimilar(prev, p), `step ${i} repeated a page`);
      for (const k of ['composition', 'skin', 'layout']) assert.notEqual(prev.strategy[k], p.strategy[k], `${k} repeated at step ${i}`);
    }
    for (const k of Object.keys(p.strategy)) (seen[k] = seen[k] || new Set()).add(p.strategy[k]);
    prev = p;
  }
  assert.equal(seen.composition.size, 9);
  assert.equal(seen.skin.size, 10);
  assert.ok(seen.layout.size >= 12, `only ${seen.layout.size} layouts seen`);
});

test('holding a variable survives the novelty gate', () => {
  let n = 0, prev = null;
  for (let i = 0; i < 40; i++) {
    const p = M.planDistinct({ goalId: 'grid', ctx: {}, locks: { composition: 'ribbon', layout: 'spine' } }, prev, () => `h${n++}`);
    assert.equal(p.strategy.composition, 'ribbon');
    assert.equal(p.strategy.layout, 'spine');
    prev = p;
  }
});
