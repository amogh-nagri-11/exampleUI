/* The Evolution instrument: fitness by generation, the live population, what the
   champion's time is spent on, and which mutations paid off. */
(function (M) {
  const h = M.h;
  const PARTS = { search: 'Finding things', read: 'Reading widgets', act: 'Acting', nav: 'Navigating', errors: 'Recovering from errors', agent: 'Reviewing the agent' };

  function chart(history) {
    const W = 360, H = 136, L = 30, R = 44, T = 10, B = 20;
    const vals = history.flatMap((x) => [x.best, x.mean]);
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 4) / 5) * 5), hi = Math.min(100, Math.ceil((Math.max(...vals) + 4) / 5) * 5);
    const n = Math.max(1, history.length - 1);
    const x = (i) => L + (i / n) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    const line = (k) => history.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
    const last = history[history.length - 1];
    const ticks = [lo, (lo + hi) / 2, hi];
    const svg = h('svg:svg', { viewBox: `0 0 ${W} ${H}`, class: 'evo-chart', role: 'img', 'aria-label': `Best fitness ${last.best}, population mean ${last.mean}, after ${last.gen} generations` },
      ticks.map((v) => [h('svg:line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'evo-grid' }), h('svg:text', { x: L - 5, y: y(v) + 3, class: 'evo-tick', 'text-anchor': 'end' }, Math.round(v))]),
      h('svg:text', { x: L, y: H - 5, class: 'evo-tick' }, 'G0'),
      h('svg:text', { x: W - R, y: H - 5, class: 'evo-tick', 'text-anchor': 'end' }, 'G' + last.gen),
      h('svg:path', { d: line('mean'), class: 'evo-mean' }),
      h('svg:path', { d: `${line('best')} L${x(n)} ${H - B} L${x(0)} ${H - B} Z`, class: 'evo-area' }),
      h('svg:path', { d: line('best'), class: 'evo-best' }),
      h('svg:circle', { cx: x(n), cy: y(last.best), r: 3.5, class: 'evo-dot' }),
      h('svg:text', { x: x(n) + 6, y: y(last.best) + 3, class: 'evo-end' }, `Best ${last.best}`),
      h('svg:text', { x: x(n) + 6, y: Math.max(y(last.mean) + 3, y(last.best) + 15), class: 'evo-end is-mean' }, `Mean ${last.mean}`),
      history.map((p, i) => h('svg:rect', { x: x(i) - (W - L - R) / n / 2, y: T, width: Math.max(4, (W - L - R) / n), height: H - T - B, class: 'evo-hit' }, h('svg:title', null, `Generation ${p.gen}: best ${p.best}, mean ${p.mean}, exploration ${Math.round(p.explore * 100)} %`))));
    return svg;
  }

  M.renderEvolution = function (host, evo, ctl) {
    if (!evo) {
      host.replaceChildren(h('p', { class: 'note' }, 'Start evolving to breed variants of the current page. Simulated operators score each one, and the best designs pass their genes on.'));
      return;
    }
    const best = evo.pop[0], last = evo.history[evo.history.length - 1];
    const status = evo.converged ? 'Converged' : evo.explore > 0.5 ? 'Exploring' : 'Refining';
    const stat = (l, v, title) => h('div', { class: 'mt', title }, h('span', { class: 'mt-l' }, l), h('b', { class: 'mt-v' }, v));
    const start = evo.history[0].best;
    host.replaceChildren(
      h('div', { class: 'evo-stats' },
        stat('Generation', evo.gen), stat('Best fitness', best.fit, 'Higher is better. 50 means operators take a minute on average.'), stat('Gain', `${best.fit - start >= 0 ? '+' : ''}${(best.fit - start).toFixed(1)}`, 'Best fitness now, compared with the starting population'),
        stat('Exploration', Math.round(evo.explore * 100) + ' %', 'Chance of extra mutations. It shrinks while nothing improves, so the design settles.'),
        stat('Designs tried', evo.seen.size), stat('Status', status)),
      chart(evo.history),
      h('div', { class: 'label' }, 'Population, best first'),
      h('div', { class: 'evo-pop' }, evo.pop.map((ind, i) => h('button', { type: 'button', class: 'evo-ind' + (ind.id === ctl.shownId ? ' is-on' : '') + (i === 0 ? ' is-best' : ''), title: `${ind.changes.join('; ')}. Born in generation ${ind.born}.`, 'aria-label': `Show design with fitness ${ind.fit}`, onclick: () => ctl.onShow(ind) },
        M.miniPage(ind.plan), h('span', { class: 'evo-fit num' }, ind.fit), h('span', { class: 'evo-born' }, i === 0 ? 'Best' : 'G' + ind.born)))),
      h('div', { class: 'evo-cols' },
        h('div', null, h('div', { class: 'label' }, "Where the champion's time goes"),
          h('div', { class: 'evo-parts' }, (() => {
            const total = Object.values(best.sim.parts).reduce((a, b) => a + b, 0) || 1;
            return Object.entries(PARTS).map(([k, label]) => h('div', { class: 'evo-part', title: `${best.sim.parts[k]} s of ${total.toFixed(1)} s` }, h('span', null, label), h('span', { class: 'cand-bar' }, h('i', { style: { width: (best.sim.parts[k] / total) * 100 + '%' } })), h('span', { class: 'num' }, best.sim.parts[k] + ' s')));
          })()),
          h('table', { class: 'evo-ops' }, h('thead', null, h('tr', null, h('th', null, 'Operator skill'), h('th', null, 'Time'), h('th', null, 'Errors'), h('th', null, 'Finished'))),
            h('tbody', null, best.sim.personas.map((p) => h('tr', null, h('td', { class: 'num' }, p.skill.toFixed(2)), h('td', { class: 'num' }, p.time + ' s'), h('td', { class: 'num' }, p.errors), h('td', { class: 'num' }, `${p.done} of 3`)))))),
        h('div', null, h('div', { class: 'label' }, 'Improvements'),
          evo.log.length ? h('ol', { class: 'evo-log' }, evo.log.slice(0, 8).map((e) => h('li', null, h('b', { class: 'num' }, `G${e.gen}  ${e.from} → ${e.to}`), h('span', null, e.changes.join('; '))))) : h('p', { class: 'note' }, 'No improvement yet.'))),
      h('p', { class: 'note evo-note' }, `Fitness is 100 × 60 ÷ (60 + seconds) for finished runs, averaged over 9 runs by simulated operators at skill ${best.sim.personas.map((p) => p.skill.toFixed(2)).join(', ')}. The operator model is a heuristic, not validated with users. It does not score colour, type or where instruments sit, so those genes drift without selection.`));
  };
})(window.Morphogen = window.Morphogen || {});
