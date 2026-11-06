/* Reusable widget library. Each renderer takes a tree node and the runtime, and binds
   to shared state, so widgets stay in sync whichever layout the planner put them in. */
(function (M) {
  const SVGNS = 'http://www.w3.org/2000/svg';
  function h(tag, props, ...kids) {
    const svg = tag.startsWith('svg:');
    const el = svg ? document.createElementNS(SVGNS, tag.slice(4)) : document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([p, x]) => (p.startsWith('--') ? el.style.setProperty(p, x) : (el.style[p] = x)));
      else if (k === 'value' && !svg) el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }
  M.h = h;

  const SEV = { crit: ['▲', 'Critical'], warn: ['◆', 'Warning'], ok: ['●', 'Normal'] };
  const sev = (s, compact) => h('span', { class: 'g-sev g-' + s, title: SEV[s][1] }, SEV[s][0], compact ? null : ' ' + SEV[s][1]);
  M.sevTag = sev;
  const fmt = (x) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
  M.fmt = fmt;
  const paintOn = (rt, chan, el, fn) => { const run = () => { el.replaceChildren(...[].concat(fn()).flat().filter(Boolean)); }; rt.on(chan, run); run(); return el; };

  function spark(values, status) {
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(' ');
    const last = values[values.length - 1];
    return h('svg:svg', { class: 'g-spark', viewBox: '0 0 100 30', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      h('svg:polygon', { points: `0,30 ${pts} 100,30`, class: 'g-spark-fill' }),
      h('svg:polyline', { points: pts, class: 'g-spark-line g-stroke-' + status, 'vector-effect': 'non-scaling-stroke' }),
      h('svg:circle', { cx: 100, cy: 28 - ((last - min) / span) * 24, r: 2, class: 'g-spark-dot g-fill-' + status, 'vector-effect': 'non-scaling-stroke' }));
  }

  /* A full chart: one y-scale, limit lines, an emphasized endpoint and a hover readout. */
  function lineChart(rt, idx) {
    const wrap = h('div', { class: 'g-chart' });
    const metric = rt.pack.metrics[idx];
    const tip = h('div', { class: 'g-chart-tip', hidden: true });
    const plot = h('div', { class: 'g-chart-plot' });
    wrap.append(plot, tip);
    let scale = null;
    const draw = () => {
      const data = rt.history(idx);
      let min = Math.min(...data, metric.target), max = Math.max(...data, metric.target);
      if (metric.hi <= max * 1.3 && metric.hi >= min * 0.7) max = Math.max(max, metric.hi);
      if (metric.lo >= min * 0.7 && metric.lo > 0) min = Math.min(min, metric.lo);
      const pad = (max - min || 1) * 0.12; min -= pad; max += pad;
      scale = { y: (v) => 100 - ((v - min) / (max - min)) * 100 };
      const pts = data.map((v, i) => `${(i / (data.length - 1)) * 300},${scale.y(v)}`).join(' ');
      const last = data[data.length - 1];
      const limits = [['hi', metric.hi], ['lo', metric.lo]].filter(([, v]) => v > min && v < max);
      plot.replaceChildren(
        h('svg:svg', { viewBox: '0 0 300 100', preserveAspectRatio: 'none', class: 'g-chart-svg', role: 'img', 'aria-label': `${metric.name}, now ${fmt(last)} ${metric.unit}` },
          [25, 50, 75].map((y) => h('svg:line', { x1: 0, x2: 300, y1: y, y2: y, class: 'g-gridline', 'vector-effect': 'non-scaling-stroke' })),
          limits.map(([, v]) => h('svg:line', { x1: 0, x2: 300, y1: scale.y(v), y2: scale.y(v), class: 'g-limit', 'vector-effect': 'non-scaling-stroke' })),
          h('svg:polygon', { points: `0,100 ${pts} 300,100`, class: 'g-area' }),
          h('svg:polyline', { points: pts, class: 'g-line', 'vector-effect': 'non-scaling-stroke' })),
        h('span', { class: 'g-axis g-axis-top' }, fmt(max)),
        h('span', { class: 'g-axis g-axis-bot' }, fmt(min)),
        ...limits.map(([k, v]) => h('span', { class: 'g-limit-label', style: { top: scale.y(v) + '%' } }, (k === 'hi' ? 'High limit ' : 'Low limit ') + fmt(v))),
        h('span', { class: 'g-endpoint', style: { top: scale.y(last) + '%' } }),
        h('span', { class: 'g-chart-now', style: { top: `min(calc(${scale.y(last)}% + 6px), calc(100% - 20px))` } }, fmt(last)));
    };
    wrap.addEventListener('pointermove', (ev) => {
      const r = wrap.getBoundingClientRect();
      const data = rt.history(idx);
      const i = Math.round(((ev.clientX - r.left) / r.width) * (data.length - 1));
      const v = data[Math.max(0, Math.min(data.length - 1, i))];
      tip.hidden = false;
      tip.textContent = `${fmt(v)} ${metric.unit}, T−${(data.length - 1 - i) * 2}s`;
      tip.style.left = Math.min(r.width - 96, Math.max(0, ev.clientX - r.left + 10)) + 'px';
    });
    wrap.addEventListener('pointerleave', () => { tip.hidden = true; });
    rt.on('tick', draw); draw();
    return wrap;
  }

  const clickEntity = (rt, ent) => ({ onclick: () => rt.select(ent.id) });
  const selClass = (rt, ent) => (rt.store.sel === ent.id ? ' is-sel' : '');
  const ranked = (rt) => [...rt.pack.entities].sort((a, b) => b.n - a.n);

  /* Two-stage button for irreversible actions. Goes through rt.count so actions are measured. */
  M.armButton = function (label, confirmLabel, onConfirm, cls) {
    let armed = false, t;
    const b = h('button', { class: 'g-btn ' + (cls || ''), type: 'button' }, label);
    b.addEventListener('click', () => {
      if (armed) { clearTimeout(t); armed = false; onConfirm(); return; }
      armed = true; b.textContent = confirmLabel; b.classList.add('is-armed');
      t = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('is-armed'); }, 4000);
    });
    return b;
  };

  function gateBody(rt, extra) {
    const g = rt.pack.gate;
    const box = h('div', { class: 'g-gate' });
    return paintOn(rt, 'step', box, () => {
      const f = rt.focus();
      const gateNode = rt.plan.workflow.nodes.find((n) => n.irreversible);
      const passed = gateNode && gateNode.base.every((b) => rt.store.done.has(b));
      const live = f && f.irreversible;
      const parts = [h('h4', { class: 'g-gate-title' }, g.title), h('p', { class: 'g-gate-detail' }, g.detail), h('div', { class: 'g-kv' }, h('span', null, 'Accountable'), h('b', null, g.who))];
      if (extra) parts.push(extra());
      if (passed) parts.push(h('div', { class: 'g-gate-state g-ok' }, '● Approved and recorded'));
      else if (live) parts.push(h('div', { class: 'g-row' }, M.armButton('Approve', 'Confirm approval', () => rt.decide('approve'), 'g-primary'), h('button', { class: 'g-btn', type: 'button', onclick: () => rt.decide('reject') }, 'Send back')));
      else parts.push(h('div', { class: 'g-gate-state g-mut' }, '◇ Opens when earlier steps finish'));
      return parts;
    });
  }

  const W = {
    kpi(n, rt) {
      const grid = h('div', { class: 'g-kpis' });
      return paintOn(rt, 'tick', grid, () => rt.pack.metrics.map((m, i) => {
        const st = rt.statusOf(i);
        return h('div', { class: 'g-kpi' }, h('div', { class: 'g-kpi-name' }, m.name), h('div', { class: 'g-kpi-val' }, fmt(rt.value(i)), h('small', null, ' ' + m.unit), ' ', sev(st, true)), spark(rt.history(i).slice(-24), st));
      }));
    },
    gauge(n, rt) {
      const grid = h('div', { class: 'g-gauges' });
      const arc = (a0, a1, r = 40) => { const p = (a) => [50 + r * Math.cos(a), 52 + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`; };
      return paintOn(rt, 'tick', grid, () => rt.pack.metrics.slice(0, 3).map((m, i) => {
        const v = rt.value(i), lo = Math.min(m.lo, m.target, m.v), hi = Math.max(m.hi, m.target, m.v), pad = (hi - lo) * 0.15 || 1;
        const f = Math.max(0, Math.min(1, (v - lo + pad) / (hi - lo + 2 * pad)));
        const st = rt.statusOf(i);
        return h('div', { class: 'g-gauge' },
          h('svg:svg', { viewBox: '0 0 100 60', role: 'img', 'aria-label': `${m.name} ${fmt(v)} ${m.unit}` },
            h('svg:path', { d: arc(Math.PI, 2 * Math.PI), class: 'g-gauge-track' }),
            h('svg:path', { d: arc(Math.PI, Math.PI + Math.max(0.02, f) * Math.PI), class: 'g-gauge-val g-stroke-' + st })),
          h('div', { class: 'g-gauge-num' }, fmt(v), h('small', null, ' ' + m.unit), ' ', sev(st, true)),
          h('div', { class: 'g-kpi-name' }, m.name));
      }));
    },
    trend(n, rt) {
      const sel = h('div', { class: 'g-tabs-mini' });
      const body = h('div', { class: 'g-fill' });
      const show = (i) => {
        sel.replaceChildren(...rt.pack.metrics.map((m, j) => h('button', { type: 'button', class: 'g-chip' + (j === i ? ' is-on' : ''), onclick: () => show(j) }, m.name.replace(/^[A-Z]+-\d+\s/, ''))));
        body.replaceChildren(lineChart(rt, i));
      };
      show(0);
      return h('div', { class: 'g-col g-fill' }, sel, body);
    },
    multitrend(n, rt) {
      return h('div', { class: 'g-multi' }, rt.pack.metrics.map((m, i) => h('div', { class: 'g-multi-cell' }, h('div', { class: 'g-kpi-name' }, m.name, m.unit ? ` (${m.unit})` : ''), lineChart(rt, i))));
    },
    alarms(n, rt) {
      const list = h('ul', { class: 'g-list' });
      return paintOn(rt, 'alarm', list, () => rt.pack.alarms.map((al) => {
        const acked = rt.store.acked.has(al.tag);
        return h('li', { class: 'g-alarm' + (acked ? ' is-acked' : '') }, sev(al.sev, true),
          h('div', { class: 'g-grow' }, h('div', null, h('b', null, al.tag), ' ', al.msg), h('small', null, 'Active ' + al.age)),
          h('button', { class: 'g-btn g-small', type: 'button', disabled: acked, onclick: () => rt.ack(al.tag) }, acked ? 'Acked' : 'Ack'));
      }));
    },
    alarmband(n, rt) { return M.alarmBand(rt); },
    mimic(n, rt) {
      const box = h('div', { class: 'g-mimic' });
      return paintOn(rt, 'select', box, () => rt.pack.entities.map((ent, i) => h('button', Object.assign({ type: 'button', class: `g-mimic-node g-border-${ent.status}${selClass(rt, ent)}`, 'data-last': i === rt.pack.entities.length - 1 ? '1' : null }, clickEntity(rt, ent)), h('span', { class: 'g-mono' }, ent.id), h('span', { class: 'g-mimic-name' }, ent.name), h('span', { class: 'g-mimic-val' }, sev(ent.status, true), ' ', ent.value))));
    },
    floor(n, rt) {
      const box = h('div', { class: 'g-floor' });
      return paintOn(rt, 'select', box, () => rt.pack.entities.map((ent, i) => h('button', Object.assign({ type: 'button', class: `g-zone g-bg-${ent.status} z${i}${selClass(rt, ent)}` }, clickEntity(rt, ent)), h('b', null, sev(ent.status, true), ' ', ent.id), h('small', null, ent.name))));
    },
    heat(n, rt) {
      const hrs = ['−4h', '−3h', '−2h', '−1h', 'Now'];
      const val = (ent, j) => Math.max(4, Math.min(100, ent.n * (0.4 + j * 0.15) + ((ent.id.charCodeAt(0) * (j + 3)) % 17) - 8));
      return h('div', { class: 'g-heatwrap' },
        h('div', { class: 'g-heat' }, h('span'), hrs.map((x) => h('span', { class: 'g-heat-h' }, x)),
          rt.pack.entities.map((ent) => [h('span', { class: 'g-heat-r g-mono' }, ent.id), hrs.map((x, j) => {
            const v = Math.round(val(ent, j));
            return h('span', { class: 'g-heat-c', title: `${ent.id} ${x}: ${v} of 100`, style: { '--v': v + '%' } });
          })])),
        h('div', { class: 'g-heat-legend' }, 'Exposure score', h('span', null, '0'), h('i'), h('span', null, '100')));
    },
    causes(n, rt) {
      const branch = (t) => { const [label, ...kids] = Array.isArray(t) ? t : [t]; return h('li', null, h('span', { class: 'g-cause' }, label), kids.length ? h('ul', null, kids.map(branch)) : null); };
      return h('ul', { class: 'g-causes' }, branch(rt.pack.causes));
    },
    table(n, rt) {
      const cols = [['id', rt.pack.entityName], ['name', 'Name'], ['status', 'State'], ['owner', 'Owner'], ['value', rt.pack.valueName], ['n', 'Score']];
      let key = 'n', dir = -1;
      const order = { crit: 3, warn: 2, ok: 1 };
      const wrap = h('div', { class: 'g-tablewrap' });
      const paint = () => {
        const rows = [...rt.pack.entities].sort((a, b) => {
          const x = key === 'status' ? order[a.status] : a[key], y = key === 'status' ? order[b.status] : b[key];
          return (x > y ? 1 : x < y ? -1 : 0) * dir;
        });
        wrap.replaceChildren(h('table', { class: 'g-table' },
          h('thead', null, h('tr', null, cols.map(([k, l]) => h('th', { 'aria-sort': key === k ? (dir > 0 ? 'ascending' : 'descending') : 'none' }, h('button', { type: 'button', onclick: () => { if (key === k) dir = -dir; else { key = k; dir = 1; } paint(); } }, l, key === k ? (dir > 0 ? ' ↑' : ' ↓') : ''))))),
          h('tbody', null, rows.map((ent) => h('tr', Object.assign({ class: selClass(rt, ent).trim(), tabindex: 0, onkeydown: (ev) => { if (ev.key === 'Enter') rt.select(ent.id); } }, clickEntity(rt, ent)),
            h('td', { class: 'g-mono' }, ent.id), h('td', null, ent.name), h('td', null, sev(ent.status)), h('td', null, ent.owner), h('td', { class: 'g-num' }, ent.value), h('td', { class: 'g-num' }, ent.n))))));
      };
      rt.on('select', paint); paint();
      return wrap;
    },
    board(n, rt) {
      const box = h('div', { class: 'g-board' });
      return paintOn(rt, 'select', box, () => [['crit', 'Act now'], ['warn', 'Watch'], ['ok', 'Normal']].map(([st, label]) => {
        const items = rt.pack.entities.filter((x) => x.status === st);
        return h('div', { class: 'g-board-col' }, h('div', { class: 'g-board-head' }, sev(st, true), ' ', label, h('span', { class: 'g-count' }, items.length)),
          items.map((ent) => h('button', Object.assign({ type: 'button', class: 'g-card' + selClass(rt, ent) }, clickEntity(rt, ent)), h('b', { class: 'g-mono' }, ent.id), h('span', null, ent.name), h('small', null, ent.owner))));
      }));
    },
    cards(n, rt) {
      const box = h('div', { class: 'g-cards' });
      return paintOn(rt, 'select', box, () => ranked(rt).map((ent) => h('button', Object.assign({ type: 'button', class: `g-card g-border-${ent.status}${selClass(rt, ent)}` }, clickEntity(rt, ent)), h('div', { class: 'g-row-between' }, h('b', { class: 'g-mono' }, ent.id), sev(ent.status, true)), h('span', null, ent.name), h('small', null, `${ent.owner} · ${ent.value}`))));
    },
    detail(n, rt) {
      const box = h('div', { class: 'g-detail' });
      return paintOn(rt, 'select', box, () => {
        const ent = rt.selected();
        return [h('div', { class: 'g-row-between' }, h('h4', { class: 'g-gate-title' }, ent.name), sev(ent.status)),
          h('div', { class: 'g-kv' }, h('span', null, rt.pack.entityName), h('b', { class: 'g-mono' }, ent.id)),
          h('div', { class: 'g-kv' }, h('span', null, 'Owner'), h('b', null, ent.owner)),
          h('div', { class: 'g-kv' }, h('span', null, rt.pack.valueName), h('b', null, ent.value)),
          h('div', { class: 'g-kv' }, h('span', null, 'Score'), h('b', null, ent.n + ' of 100')),
          h('div', { class: 'g-meter' }, h('i', { style: { width: ent.n + '%' } }))];
      });
    },
    bars(n, rt) {
      const box = h('div', { class: 'g-bars' });
      return paintOn(rt, 'select', box, () => ranked(rt).map((ent) => h('button', Object.assign({ type: 'button', class: 'g-bar' + selClass(rt, ent) }, clickEntity(rt, ent), { title: `${ent.name}: ${ent.n} of 100` }), h('span', { class: 'g-mono g-bar-l' }, ent.id), h('span', { class: 'g-bar-t' }, h('i', { style: { width: ent.n + '%' } })), h('span', { class: 'g-num' }, ent.n))));
    },
    risk(n, rt) {
      const box = h('div', { class: 'g-riskwrap' });
      return paintOn(rt, 'select', box, () => {
        const cell = {};
        rt.pack.entities.forEach((ent) => {
          const impact = ent.n > 66 ? 2 : ent.n > 33 ? 1 : 0;
          const like = (ent.id.length + ent.owner.length + (ent.status === 'crit' ? 4 : 0)) % 3;
          (cell[`${like}-${impact}`] = cell[`${like}-${impact}`] || []).push(ent);
        });
        const grid = h('div', { class: 'g-risk' });
        for (let imp = 2; imp >= 0; imp--) for (let like = 0; like < 3; like++) {
          const score = imp + like;
          grid.append(h('div', { class: 'g-risk-c r' + (score >= 3 ? 'h' : score === 2 ? 'm' : 'l') }, (cell[`${like}-${imp}`] || []).map((ent) => h('button', Object.assign({ type: 'button', class: 'g-risk-dot' + selClass(rt, ent), title: ent.name }, clickEntity(rt, ent)), ent.id))));
        }
        return [h('span', { class: 'g-risk-y' }, 'Impact ↑'), grid, h('span', { class: 'g-risk-x' }, 'Likelihood →')];
      });
    },
    gantt(n, rt) {
      const box = h('div', { class: 'g-gantt' });
      return paintOn(rt, 'step', box, () => {
        const nodes = rt.plan.workflow.nodes, st = M.wfStatus(rt.plan, rt.store.done), unit = 100 / nodes.length;
        return nodes.map((x, i) => h('div', { class: 'g-gantt-row' }, h('span', { class: 'g-gantt-l' }, x.verb), h('span', { class: 'g-gantt-t' }, h('i', { class: 'g-gantt-b is-' + st[x.id], style: { left: i * unit + '%', width: unit * (x.base.length || 1) * 0.95 + '%' } }, st[x.id] === 'done' ? '✓' : `T+${i * 12}m`))));
      });
    },
    advisor(n, rt) {
      const box = h('div', { class: 'g-recs' });
      return paintOn(rt, 'decision', box, () => rt.pack.recs.map((r, i) => h('div', { class: 'g-rec' + (rt.store.decision === i ? ' is-sel' : '') },
        h('div', { class: 'g-rec-head' }, h('span', { class: 'g-agent-tag' }, 'Agent'), h('span', { class: 'g-num' }, Math.round(r.conf * 100) + ' % confidence')),
        h('b', null, r.t), h('small', null, r.why),
        h('div', { class: 'g-meter' }, h('i', { style: { width: r.conf * 100 + '%' } })),
        h('button', { type: 'button', class: 'g-btn g-small', onclick: () => rt.decideOption(i) }, rt.store.decision === i ? 'Selected' : 'Use this'))));
    },
    scenario(n, rt) {
      const box = h('div', { class: 'g-scen' });
      return paintOn(rt, 'decision', box, () => rt.pack.recs.map((r, i) => h('button', { type: 'button', class: 'g-scen-opt' + (rt.store.decision === i ? ' is-sel' : ''), onclick: () => rt.decideOption(i) },
        h('span', { class: 'g-scen-k' }, 'Option ' + 'ABC'[i]), h('b', null, r.t), h('small', null, r.why), h('span', { class: 'g-meter' }, h('i', { style: { width: r.conf * 100 + '%' } })), h('span', { class: 'g-num' }, Math.round(r.conf * 100) + ' %'))));
    },
    control(n, rt) {
      const c = rt.pack.control, id = 'ctl-' + n.id;
      const read = h('output', { class: 'g-ctl-val', for: id }, fmt(rt.store.setpoint), h('small', null, ' ' + c.u));
      return h('div', { class: 'g-ctl' }, h('label', { for: id, class: 'g-kpi-name' }, c.l), read,
        h('input', { id, type: 'range', min: c.min, max: c.max, step: c.step, value: rt.store.setpoint, oninput: (ev) => { rt.setpoint(+ev.target.value); read.replaceChildren(fmt(+ev.target.value), h('small', null, ' ' + c.u)); }, onchange: () => rt.log(`${c.l} set to ${rt.store.setpoint} ${c.u}`) }),
        h('div', { class: 'g-row-between g-mut' }, h('small', null, c.min + ' ' + c.u), h('small', null, c.max + ' ' + c.u)));
    },
    actions(n, rt) {
      return h('div', { class: 'g-pad' }, rt.pack.actions.map((a) => h('button', { type: 'button', class: 'g-btn', onclick: () => { rt.count(); rt.log('Action: ' + a); } }, a)));
    },
    form(n, rt) {
      const fields = rt.pack.form.map((f, i) => {
        const id = `f-${n.id}-${i}`;
        return h('div', { class: 'g-field' }, h('label', { for: id }, f.l), f.t === 'text' ? h('textarea', { id, rows: 2 }, f.v) : h('select', { id }, f.o.map((o) => h('option', null, o))));
      });
      const note = h('small', { class: 'g-mut', role: 'status' }, '');
      return h('form', { class: 'g-form', onsubmit: (ev) => { ev.preventDefault(); rt.count(); rt.log('Record saved: ' + rt.pack.form[0].l); note.textContent = 'Saved to the evidence log.'; } }, fields, h('div', { class: 'g-row' }, h('button', { class: 'g-btn', type: 'submit' }, 'Save record'), note));
    },
    checklist(n, rt) {
      const box = h('div', { class: 'g-check' });
      return paintOn(rt, 'check', box, () => {
        const items = rt.pack.checklist, count = items.filter((_, i) => rt.store.checks.has(i)).length;
        return [h('div', { class: 'g-row-between g-mut' }, h('small', null, `${count} of ${items.length} confirmed`)), h('div', { class: 'g-meter' }, h('i', { style: { width: (count / items.length) * 100 + '%' } })),
          items.map((t, i) => h('label', { class: 'g-check-item' }, h('input', { type: 'checkbox', checked: rt.store.checks.has(i), onchange: () => rt.toggleCheck(i) }), h('span', null, t)))];
      });
    },
    readiness(n, rt) {
      const box = h('div', { class: 'g-ready' });
      return paintOn(rt, 'tick', box, () => rt.pack.metrics.map((m, i) => {
        const st = rt.statusOf(i);
        return h('div', { class: 'g-kv' }, h('span', null, m.name), h('b', null, sev(st, true), ' ', st === 'ok' ? 'Ready' : 'Hold'));
      }));
    },
    approval(n, rt) { return gateBody(rt); },
    signoff(n, rt) {
      const id = 'sig-' + n.id;
      return gateBody(rt, () => h('div', { class: 'g-field' }, h('label', { for: id }, 'Signed by'), h('input', { id, value: rt.pack.gate.who, readonly: true })));
    },
    log(n, rt) {
      const list = h('ol', { class: 'g-log' });
      return paintOn(rt, 'log', list, () => [...rt.store.events].reverse().map((e) => h('li', null, e)));
    },
    sop(n, rt) {
      const [title, ...lines] = rt.pack.sop;
      return h('div', { class: 'g-sop' }, h('b', null, title), h('ol', null, lines.map((l) => h('li', null, l))));
    },
    launchpad(n, rt) {
      const box = h('div', { class: 'g-launch' });
      return paintOn(rt, 'step', box, () => {
        const st = M.wfStatus(rt.plan, rt.store.done);
        return rt.screens().filter((s) => !s.hub).map((s) => {
          const nodes = rt.plan.workflow.nodes.filter((x) => s.nodes.includes(x.id));
          const finished = nodes.every((x) => st[x.id] === 'done'), live = nodes.some((x) => st[x.id] === 'active');
          return h('button', { type: 'button', class: 'g-tile' + (live ? ' is-live' : ''), onclick: () => { rt.count(); rt.goScreen(s.id); } },
            h('small', null, finished ? '✓ Finished' : live ? '● Needs attention' : '◇ Waiting'), h('b', null, s.name), h('span', { class: 'g-mut' }, nodes.map((x) => x.label).join('; ')));
        });
      });
    }
  };
  M.WIDGETS = W;

  M.alarmBand = function (rt) {
    const el = h('div', { class: 'g-band' });
    return paintOn(rt, 'alarm', el, () => {
      const open = rt.pack.alarms.filter((a) => a.sev !== 'ok' && !rt.store.acked.has(a.tag));
      if (!open.length) return [sev('ok', true), h('span', null, ' All alarms acknowledged')];
      const top = open[0];
      return [sev(top.sev, true), h('b', null, ' ' + top.tag), h('span', { class: 'g-band-msg' }, ' ' + top.msg), h('span', { class: 'g-count' }, open.length + ' open'), h('button', { type: 'button', class: 'g-btn g-small', onclick: () => rt.ack(top.tag) }, 'Ack')];
    });
  };
})(window.Morphogen = window.Morphogen || {});
