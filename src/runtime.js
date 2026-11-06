/* Runtime: turns a plan into a working application and owns its live state.
   State is held separately from any plan, so workflow progress survives every replan. */
(function (M) {
  const h = M.h;

  M.newStore = function (pack) {
    return {
      goalId: pack.id, done: new Set(), acked: new Set(), checks: new Set(), decision: null, sel: pack.entities[0].id,
      setpoint: pack.control.v, events: [...pack.events], hist: pack.metrics.map((m) => Array.from({ length: 60 }, (_, i) => m.v + wobble(m, i))),
      focusId: null, actions: 0, hold: false, tickN: 60
    };
  };
  function wobble(m, i) { return Math.sin(i * 0.43 + m.v) * spread(m) * 0.5 + Math.sin(i * 0.11) * spread(m) * 0.5; }
  function spread(m) { return Math.abs(m.v - m.target) * 0.05 + Math.abs(m.v) * 0.004; }

  M.createRuntime = function (plan, pack, store, hooks) {
    const subs = {};
    const timers = [];
    const rt = {
      plan, pack, store,
      on(ch, fn) { (subs[ch] = subs[ch] || []).push(fn); },
      emit(ch) { (subs[ch] || []).forEach((fn) => fn()); },
      clearSubs() { Object.keys(subs).forEach((k) => (subs[k] = [])); },
      progress() { return store.done.size / pack.steps.length; },
      history(i) { return store.hist[i]; },
      value(i) { const a = store.hist[i]; return a[a.length - 1]; },
      statusOf(i) {
        const m = pack.metrics[i], v = rt.value(i);
        if (v >= m.lo && v <= m.hi) return 'ok';
        const range = Math.abs(m.hi - m.lo) || 1, off = v > m.hi ? v - m.hi : m.lo - v;
        return off / range > 0.12 ? 'crit' : 'warn';
      },
      tick() {
        const c = pack.control;
        const setEffect = (store.setpoint - c.v) / ((c.max - c.min) || 1);
        pack.metrics.forEach((m, i) => {
          const towards = rt.progress();
          let want = m.v + (m.target - m.v) * towards;
          want += (m.target - m.v) * setEffect * (i === c.metric ? 0.9 : 0.25);
          const a = store.hist[i], cur = a[a.length - 1];
          const next = cur + (want - cur) * 0.14 + wobble(m, store.tickN) * 0.09;
          a.push(next); if (a.length > 60) a.shift();
        });
        store.tickN++;
        rt.emit('tick');
      },
      select(id) { store.sel = id; rt.count(); rt.emit('select'); rt.log(`Selected ${id}`, true); },
      selected() { return pack.entities.find((e) => e.id === store.sel) || pack.entities[0]; },
      ack(tag) { store.acked.add(tag); rt.count(); rt.emit('alarm'); rt.log('Acknowledged ' + tag); },
      setpoint(v) { store.setpoint = v; },
      toggleCheck(i) { if (store.checks.has(i)) store.checks.delete(i); else store.checks.add(i); rt.count(); rt.emit('check'); },
      decideOption(i) { store.decision = i; rt.count(); rt.emit('decision'); rt.log('Chosen response: ' + pack.recs[i].t); },
      count() { store.actions++; hooks.onActions(); },
      log(msg, quiet) {
        if (quiet) return;
        const d = new Date();
        store.events.push(`${d.toTimeString().slice(0, 8)} ${msg}`);
        if (store.events.length > 40) store.events.shift();
        rt.emit('log');
      },
      status() { return M.wfStatus(plan, store.done); },
      focus() {
        const st = rt.status();
        const held = plan.workflow.nodes.find((n) => n.id === store.focusId && st[n.id] === 'active');
        return held || plan.workflow.nodes.find((n) => st[n.id] === 'active') || null;
      },
      setFocus(id) {
        const node = plan.workflow.nodes.find((n) => n.id === id);
        if (!node) return;
        store.focusId = id;
        const s = rt.screens().find((x) => x.nodes.includes(id));
        if (s && s.id !== rt.currentScreen) rt.goScreen(s.id); else rt.emit('step');
        scheduleAgent();
      },
      complete(viaAgent) {
        const f = rt.focus();
        if (!f) return;
        if (f.irreversible && !viaAgent) return;
        if (!viaAgent) rt.count();
        finish(f, viaAgent ? `Agent finished ${f.verb}` : `${f.verb} finished by operator`);
      },
      decide(kind, force) {
        const f = rt.focus();
        if (!f) return;
        if (!force) rt.count();
        if (kind === 'approve') { finish(f, `${pack.gate.title}: approved by ${pack.gate.who}`); return; }
        const target = f.backTo || f.retryTo;
        if (!target) return;
        const node = plan.workflow.nodes.find((n) => n.id === target);
        const order = pack.steps.map((s) => s.id);
        const from = Math.min(...node.base.map((b) => order.indexOf(b)));
        order.slice(from).forEach((b) => store.done.delete(b));
        rt.log(`${f.verb} sent back to ${node.verb}`);
        store.focusId = node.id;
        hooks.onStep('reject', f.id, node.id);
        rt.setFocus(node.id);
      },
      holdAgent() { store.hold = true; clearAgent(); rt.count(); rt.log('Operator took over from the agent'); rt.emit('step'); },
      releaseAgent() { store.hold = false; scheduleAgent(); rt.emit('step'); },
      screens() { return viewport().children; },
      currentScreen: null,
      goScreen(id) { rt.currentScreen = id; renderScreen(); rt.emit('step'); hooks.onScreen(id); },
      destroy() { clearAgent(); timers.forEach(clearTimeout); rt.clearSubs(); if (rt.resizeWatch) rt.resizeWatch.disconnect(); }
    };

    const viewport = () => plan.tree.children.find((c) => c.type === 'viewport');
    let agentTimer = null;
    const clearAgent = () => { if (agentTimer) clearTimeout(agentTimer); agentTimer = null; };
    function scheduleAgent() {
      clearAgent();
      const f = rt.focus();
      if (!f || f.actor !== 'agent' || store.hold || hooks.paused()) return;
      agentTimer = setTimeout(() => rt.complete(true), 2800);
    }
    function finish(node, msg) {
      node.base.forEach((b) => store.done.add(b));
      store.hold = false;
      rt.log(msg);
      hooks.onStep('done', node.id);
      const next = rt.focus();
      store.focusId = next ? next.id : null;
      if (next) {
        const s = rt.screens().find((x) => x.nodes.includes(next.id));
        if (s && s.id !== rt.currentScreen && !rt.screens()[0].hub) rt.goScreen(s.id);
        else if (s && s.id !== rt.currentScreen) rt.goScreen('overview');
        else rt.emit('step');
      } else rt.emit('step');
      scheduleAgent();
    }

    /* ---------- Tree rendering ---------- */
    function panel(n) {
      const renderer = M.WIDGETS[n.widget];
      const el = h('section', { class: `g-panel fam-${n.family}${n.hero ? ' is-hero' : ''}`, 'data-nid': n.id, 'data-label': n.widget, 'data-step': n.forStep, 'aria-label': n.name, style: { viewTransitionName: 'w-' + n.widget } },
        h('header', { class: 'g-panel-head' }, h('h3', null, n.name)),
        h('div', { class: 'g-panel-body' }, renderer(n, rt)));
      return el;
    }
    function applyPlacement(el, n, parent) {
      if (n.place && parent.layout && parent.layout.mode === 'grid') {
        el.style.gridColumn = `span ${n.place.cs}`;
        el.style.gridRow = parent.layout.fill ? '' : `span ${n.place.rs}`;
      }
      if (n.grow && parent.layout && parent.layout.mode === 'split') el.style.flexGrow = n.grow;
      if (n.free && parent.layout && parent.layout.mode === 'free') {
        Object.assign(el.style, { left: n.free.l + '%', width: n.free.w + '%', top: n.free.t + 'px', height: n.free.h + 'px', zIndex: n.free.z || 1 });
        el.classList.add('g-freeitem');
      }
    }
    function renderNode(n, parent) {
      let el;
      if (n.type === 'widget') el = panel(n);
      else {
        const lay = n.layout || { mode: 'stack' };
        const attrs = { class: `g-box g-${lay.mode}${lay.dir ? ' g-' + lay.dir : ''}${lay.fill ? ' g-fillgrid' : ''}`, 'data-nid': n.id, 'data-label': n.name };
        if (lay.mode === 'tabs') el = renderTabs(n, attrs);
        else {
          el = h('div', attrs);
          if (lay.mode === 'grid') el.style.gridTemplateColumns = `repeat(${lay.cols}, minmax(0, 1fr))`;
          if (lay.mode === 'free') {
            el.style.minHeight = lay.minH + 'px';
            el.linkPairs = lay.links;
            if (lay.stacked) el.classList.add('g-stacked');
            if (lay.stacked) el.addEventListener('pointerdown', (ev) => { const it = ev.target.closest('.g-freeitem'); if (it) it.style.zIndex = ++topSheet; });
          }
          if (lay.mode === 'section') el.append(h('h3', { class: 'g-section-title' }, n.name));
          if (lay.mode === 'lane') el.append(h('h3', { class: 'g-lane-title' }, n.name));
          n.children.forEach((c) => el.append(renderNode(c, n)));
        }
      }
      if (parent) applyPlacement(el, n, parent);
      return el;
    }
    let topSheet = 100;
    /* Data wires are measured from the rendered widgets, so they follow real positions. */
    function drawWires() {
      if (!screenHost) return;
      screenHost.querySelectorAll('.g-free').forEach((field) => {
        const old = field.querySelector(':scope > .g-wires');
        if (old) old.remove();
        if (!field.linkPairs || !field.linkPairs.length) return;
        const box = field.getBoundingClientRect();
        if (!box.width) return;
        const paths = field.linkPairs.map(([a, b]) => {
          const ea = field.querySelector(`:scope > [data-nid="${a}"]`), eb = field.querySelector(`:scope > [data-nid="${b}"]`);
          if (!ea || !eb) return null;
          const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
          const ax = ra.left + ra.width / 2 - box.left, ay = ra.top + ra.height / 2 - box.top, bx = rb.left + rb.width / 2 - box.left, by = rb.top + rb.height / 2 - box.top;
          return h('svg:path', { d: `M${ax} ${ay} C${(ax + bx) / 2} ${ay} ${(ax + bx) / 2} ${by} ${bx} ${by}` });
        }).filter(Boolean);
        field.prepend(h('svg:svg', { class: 'g-wires', 'aria-hidden': 'true', width: box.width, height: box.height }, paths));
      });
    }
    const tabState = store.tabs || (store.tabs = {});
    function renderTabs(n, attrs) {
      const keyOf = n.name + n.children.map((c) => c.id).join();
      const pane = h('div', { class: 'g-tabs-pane' });
      const bar = h('div', { class: 'g-tabs-bar', role: 'tablist' });
      const show = (i) => {
        tabState[keyOf] = i;
        bar.replaceChildren(...n.children.map((c, j) => h('button', { type: 'button', role: 'tab', 'aria-selected': j === i ? 'true' : 'false', class: 'g-tab' + (j === i ? ' is-on' : ''), 'data-tab-for': c.id, onclick: () => show(j) }, c.name)));
        pane.replaceChildren(renderNode(n.children[i], n));
      };
      const el = h('div', attrs, bar, pane);
      show(Math.min(tabState[keyOf] || 0, n.children.length - 1));
      el.openChild = (id) => { const i = n.children.findIndex((c) => c.id === id || contains(c, id)); if (i >= 0) show(i); };
      return el;
    }
    const contains = (node, id) => { let f = false; M.walk(node, (x) => { if (x.id === id) f = true; }); return f; };

    let screenHost = null;
    function renderScreen() {
      const s = rt.screens().find((x) => x.id === rt.currentScreen) || rt.screens()[0];
      rt.currentScreen = s.id;
      screenSubsReset();
      const el = h('div', { class: 'g-screen', 'data-nid': s.id, 'data-label': s.name }, s.children.map((c) => renderNode(c, s)));
      screenHost.replaceChildren(el);
      screenHost.scrollTop = 0;
      requestAnimationFrame(drawWires);
    }
    /* Widgets subscribe per render. Chrome subscriptions stay; screen subscriptions are replaced. */
    let chromeSubs = null;
    function screenSubsReset() {
      if (!chromeSubs) return;
      Object.keys(subs).forEach((k) => { subs[k] = (chromeSubs[k] || []).slice(); });
    }

    /* ---------- Interaction surfaces: the same workflow, driven in six different ways ---------- */
    function stepActions(compact) {
      const f = rt.focus();
      if (!f) return [h('span', { class: 'g-ok' }, '● Goal reached')];
      if (f.actor === 'agent' && !store.hold && !hooks.paused()) return [h('span', { class: 'g-agent-tag is-busy' }, 'Agent working'), h('button', { type: 'button', class: 'g-btn g-small', onclick: rt.holdAgent }, 'Take over')];
      if (f.irreversible) return [M.armButton('Approve', 'Confirm approval', () => rt.decide('approve'), 'g-primary'), h('button', { type: 'button', class: 'g-btn', onclick: () => rt.decide('reject') }, 'Send back')];
      return [h('button', { type: 'button', class: 'g-btn g-primary', onclick: () => rt.complete() }, compact ? 'Done' : `Complete ${f.verb}`), f.retryTo ? h('button', { type: 'button', class: 'g-btn', onclick: () => rt.decide('reject') }, 'Retry earlier step') : null];
    }
    const actorTag = (n) => h('span', { class: 'g-actor a-' + n.actor }, { human: 'Human', agent: 'Agent', joint: 'Joint' }[n.actor]);
    const live = (el, fn) => { const run = () => el.replaceChildren(...[].concat(fn()).flat().filter(Boolean)); rt.on('step', run); run(); return el; };
    const stepNo = (f) => plan.workflow.nodes.indexOf(f) + 1;

    function surface() {
      const kind = plan.shell.surface;
      const total = plan.workflow.nodes.length;
      if (kind === 'direct') return live(h('div', { class: 'g-surface g-stepbar' }), () => {
        const f = rt.focus();
        return [h('div', { class: 'g-grow' }, f ? [h('small', { class: 'g-mut' }, `Step ${stepNo(f)} of ${total} `), actorTag(f), h('div', null, h('b', null, f.verb), ' ', f.label)] : h('b', null, 'All steps finished')), stepActions()];
      });
      if (kind === 'guided') return live(h('div', { class: 'g-surface g-guided' }), () => {
        const f = rt.focus(), st = rt.status();
        return [h('div', { class: 'g-pips' }, plan.workflow.nodes.map((n) => h('i', { class: 'is-' + st[n.id], title: n.verb }))), h('div', { class: 'g-grow' }, f ? [h('b', null, `Now: ${f.label}`), h('small', { class: 'g-mut g-block' }, `Step ${stepNo(f)} of ${total}. The next step unlocks when this one finishes.`)] : h('b', null, 'Procedure finished')), stepActions()];
      });
      if (kind === 'mixed') return live(h('div', { class: 'g-surface g-proposal' }), () => {
        const f = rt.focus();
        if (!f) return h('b', { class: 'g-ok' }, '● Goal reached');
        const rec = pack.recs[stepNo(f) % pack.recs.length];
        return [h('span', { class: 'g-agent-tag' }, 'Agent proposes'), h('div', { class: 'g-grow' }, h('b', null, f.verb + ': '), f.irreversible ? pack.gate.title : rec.t, h('small', { class: 'g-mut g-block' }, f.irreversible ? 'This needs your decision.' : rec.why)), stepActions()];
      });
      if (kind === 'command') {
        const out = h('div', { class: 'g-cmd-out', role: 'log', 'aria-live': 'polite' });
        const id = 'cmd-' + plan.seed;
        const run = (raw) => { const r = M.runCommand(raw, rt); out.replaceChildren(h('b', null, '> ' + raw), ' ', r); };
        const hints = live(h('div', { class: 'g-cmd-hints' }), () => {
          const f = rt.focus();
          const verbs = !f ? [] : f.irreversible ? ['approve', 'reject'] : ['done', ...(f.retryTo ? ['retry'] : [])];
          return [f ? h('span', { class: 'g-mut' }, `${stepNo(f)}/${total} ${f.verb}`) : h('span', { class: 'g-ok' }, '● Goal reached'), [...verbs, 'status', 'select ' + pack.entities[1].id].map((v) => h('button', { type: 'button', class: 'g-chip', onclick: () => run(v) }, v))];
        });
        const input = h('input', { id, class: 'g-cmd-input', autocomplete: 'off', spellcheck: 'false', placeholder: 'Type a command, for example done or goto ' + pack.steps[1].id, 'aria-label': 'Command' });
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && input.value.trim()) { run(input.value.trim()); input.value = ''; } });
        return h('div', { class: 'g-surface g-cmd' }, hints, out, h('div', { class: 'g-cmd-line' }, h('span', { class: 'g-mono' }, '>'), input));
      }
      if (kind === 'supervisory') return live(h('aside', { class: 'g-surface g-queue' }), () => {
        const st = rt.status(), f = rt.focus();
        return [h('h3', { class: 'g-section-title' }, 'Supervision queue'), h('ul', { class: 'g-qlist' }, plan.workflow.nodes.map((n) => h('li', { class: 'g-q is-' + st[n.id] + (f === n ? ' is-focus' : '') },
          h('div', { class: 'g-row-between' }, h('button', { type: 'button', class: 'g-linkish', onclick: () => rt.setFocus(n.id), disabled: st[n.id] === 'pending' }, n.verb), actorTag(n)),
          h('small', { class: 'g-mut' }, st[n.id] === 'done' ? '✓ Finished' : f === n ? n.label : st[n.id] === 'active' ? 'Ready' : '◇ Queued'),
          f === n ? h('div', { class: 'g-row' }, stepActions(true)) : null)))];
      });
      /* Conversational */
      const id = 'say-' + plan.seed;
      const thread = h('div', { class: 'g-thread-log', role: 'log' });
      const composer = h('input', { id, class: 'g-cmd-input', placeholder: 'Reply to the agent', autocomplete: 'off', 'aria-label': 'Reply to the agent' });
      const reply = h('div', { class: 'g-toast-line g-mut' });
      composer.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && composer.value.trim()) { reply.textContent = M.runCommand(composer.value.trim(), rt); composer.value = ''; } });
      live(thread, () => {
        const st = rt.status(), f = rt.focus();
        const msgs = [h('div', { class: 'g-msg' }, h('span', { class: 'g-agent-tag' }, 'Agent'), h('p', null, `I am working on: ${plan.goal}. I laid out what you need for each step.`))];
        plan.workflow.nodes.forEach((n) => {
          if (st[n.id] === 'done') { msgs.push(h('div', { class: 'g-msg is-done' }, h('p', null, `✓ ${n.verb}: ${n.label}`))); }
          else if (n === f) msgs.push(h('div', { class: 'g-msg is-now' }, h('span', { class: 'g-agent-tag' }, 'Agent'), h('p', null, n.irreversible ? `${pack.gate.title}. ${pack.gate.detail}` : `Next is ${n.verb.toLowerCase()}: ${n.label.toLowerCase()}. ${pack.recs[stepNo(n) % pack.recs.length].t}?`), h('div', { class: 'g-row' }, stepActions(true), h('button', { type: 'button', class: 'g-chip', onclick: () => rt.setFocus(n.id) }, 'Show me'))));
        });
        return msgs;
      });
      return h('aside', { class: 'g-surface g-thread' }, h('h3', { class: 'g-section-title' }, 'Agent thread'), thread, reply, composer);
    }

    /* ---------- Navigation models ---------- */
    function nav() {
      const kind = plan.shell.nav;
      const screens = rt.screens();
      const mark = (s) => {
        if (s.hub) return '⌂';
        const st = rt.status(), ns = plan.workflow.nodes.filter((x) => s.nodes.includes(x.id));
        return ns.every((x) => st[x.id] === 'done') ? '✓' : ns.some((x) => st[x.id] === 'active') ? '●' : '◇';
      };
      const go = (s) => { rt.count(); rt.goScreen(s.id); };
      const items = (cls, short) => screens.map((s) => h('button', { type: 'button', class: cls + (s.id === rt.currentScreen ? ' is-on' : ''), 'aria-current': s.id === rt.currentScreen ? 'page' : null, onclick: () => go(s), title: s.name }, h('span', { class: 'g-mark' }, mark(s)), short ? null : h('span', { class: 'g-navlabel' }, s.name)));
      if (kind === 'rail') return live(h('nav', { class: 'g-rail', 'aria-label': 'Screens' }), () => items('g-rail-item'));
      if (kind === 'tabs') return live(h('nav', { class: 'g-topnav', 'aria-label': 'Screens' }), () => items('g-topnav-item'));
      if (kind === 'dock') return live(h('nav', { class: 'g-dock', 'aria-label': 'Screens' }), () => items('g-dock-item'));
      if (kind === 'stepper') return live(h('nav', { class: 'g-stepper', 'aria-label': 'Procedure steps' }), () => {
        const st = rt.status();
        return plan.workflow.nodes.map((n, i) => h('button', { type: 'button', class: `g-step is-${st[n.id]}`, disabled: st[n.id] === 'pending', onclick: () => { rt.count(); rt.setFocus(n.id); } }, h('span', { class: 'g-step-n' }, st[n.id] === 'done' ? '✓' : i + 1), h('span', { class: 'g-navlabel' }, n.verb)));
      });
      if (kind === 'timeline') return live(h('nav', { class: 'g-timeline', 'aria-label': 'Workflow timeline' }), () => {
        const st = rt.status(), nodes = plan.workflow.nodes;
        const pct = (nodes.filter((n) => st[n.id] === 'done').length / nodes.length) * 100;
        return [h('div', { class: 'g-timeline-track' }, h('i', { style: { width: pct + '%' } })), h('div', { class: 'g-timeline-ticks' }, nodes.map((n) => h('button', { type: 'button', class: 'g-tick is-' + st[n.id], disabled: st[n.id] === 'pending', onclick: () => { rt.count(); rt.setFocus(n.id); } }, h('i'), h('span', { class: 'g-navlabel' }, n.verb))))];
      });
      if (kind === 'hub') return live(h('nav', { class: 'g-crumbs', 'aria-label': 'Breadcrumb' }), () => {
        const cur = screens.find((s) => s.id === rt.currentScreen);
        return [h('button', { type: 'button', class: 'g-linkish', onclick: () => go(screens[0]) }, 'Overview'), cur && !cur.hub ? [h('span', { class: 'g-mut' }, ' / '), h('b', null, cur.name)] : null];
      });
      if (kind === 'palette') {
        const pop = h('div', { class: 'g-palette', hidden: true });
        const id = 'pal-' + plan.seed;
        const input = h('input', { id, class: 'g-cmd-input', placeholder: 'Jump to a screen', autocomplete: 'off', 'aria-label': 'Jump to a screen' });
        const fill = () => {
          const q = input.value.toLowerCase();
          pop.replaceChildren(...screens.filter((s) => s.name.toLowerCase().includes(q)).map((s) => h('button', { type: 'button', class: 'g-palette-item' + (s.id === rt.currentScreen ? ' is-on' : ''), onmousedown: (ev) => { ev.preventDefault(); pop.hidden = true; input.value = ''; go(s); } }, h('span', { class: 'g-mark' }, mark(s)), s.name)));
        };
        input.addEventListener('focus', () => { fill(); pop.hidden = false; });
        input.addEventListener('blur', () => { pop.hidden = true; });
        input.addEventListener('input', fill);
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { const first = pop.querySelector('button'); if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } if (ev.key === 'Escape') input.blur(); });
        return h('nav', { class: 'g-palette-wrap', 'aria-label': 'Screen palette' }, h('span', { class: 'g-mono g-mut' }, '⌕'), input, pop);
      }
      if (kind === 'anchors') return live(h('nav', { class: 'g-anchors', 'aria-label': 'Steps on this surface' }), () => {
        const st = rt.status();
        return plan.workflow.nodes.map((n) => h('button', { type: 'button', class: 'g-chip is-' + st[n.id] + (rt.focus() === n ? ' is-on' : ''), disabled: st[n.id] === 'pending', onclick: () => { rt.count(); rt.setFocus(n.id); const hit = screenHost.querySelector(`[data-step="${n.verb}"]`); if (hit) hit.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, st[n.id] === 'done' ? '✓ ' : '', n.verb));
      });
      return null;
    }

    /* ---------- Shell assembly ---------- */
    rt.mount = function (root, startScreen) {
      root.replaceChildren();
      const shell = plan.shell;
      root.removeAttribute('style');
      root.className = `gen t-${plan.identity.treatment} bg-${plan.identity.bg} density-${shell.density} device-${plan.ctx.device}`;
      Object.entries(plan.identity.appVars).forEach(([k, v]) => root.style.setProperty(k, v));
      const nid = (slot) => plan.tree.children.find((c) => c.slot === slot);
      const tag = (el, slot) => { const c = nid(slot); if (el && c) { el.setAttribute('data-nid', c.id); el.setAttribute('data-label', c.name); } return el; };

      const header = tag(h('header', { class: 'g-appbar is-' + shell.header },
        h('div', { class: 'g-appname' }, pack.app),
        shell.header === 'full' ? h('div', { class: 'g-appgoal' }, plan.goal) : null,
        live(h('div', { class: 'g-appstate' }), () => {
          const st = rt.status(), d = plan.workflow.nodes.filter((n) => st[n.id] === 'done').length;
          return [h('span', { class: 'g-mono' }, `${d}/${plan.workflow.nodes.length}`), h('span', { class: 'g-meter g-meter-sm' }, h('i', { style: { width: (d / plan.workflow.nodes.length) * 100 + '%' } }))];
        })), 'header');
      const alarm = shell.alarmStrip ? tag(M.alarmBand(rt), 'alarm') : null;
      const navEl = tag(nav(), 'nav');
      const surf = tag(surface(), 'surface');
      screenHost = h('main', { class: 'g-viewport' });
      if (viewport()) { screenHost.setAttribute('data-nid', viewport().id); screenHost.setAttribute('data-label', viewport().name); }

      const side = shell.surface === 'conversational' || shell.surface === 'supervisory';
      const leftOf = (shell.nav === 'rail' ? [navEl] : []).concat(side && shell.surfaceSide === 'left' ? [surf] : []);
      const rightOf = side && shell.surfaceSide !== 'left' ? [surf] : [];
      const body = h('div', { class: 'g-body' }, leftOf, screenHost, rightOf);
      const topNav = ['tabs', 'stepper', 'hub', 'palette', 'anchors'].includes(shell.nav) ? navEl : null;
      const botNav = shell.nav === 'timeline' ? navEl : null;
      const topSurf = !side && shell.surfaceSide === 'top' ? surf : null;
      const botSurf = !side && shell.surfaceSide !== 'top' ? surf : null;
      root.append(...[header, alarm, topNav, topSurf, body, botSurf, botNav, shell.nav === 'dock' ? navEl : null].filter(Boolean));

      chromeSubs = {};
      Object.keys(subs).forEach((k) => (chromeSubs[k] = subs[k].slice()));
      const f = rt.focus();
      const target = startScreen && rt.screens().some((s) => s.id === startScreen) ? startScreen : (f && rt.screens().find((s) => s.nodes.includes(f.id)) || rt.screens()[0]).id;
      rt.currentScreen = rt.screens()[0].hub && !startScreen ? 'overview' : target;
      renderScreen();
      rt.emit('step');
      scheduleAgent();
      if (window.ResizeObserver) { rt.resizeWatch = new ResizeObserver(() => drawWires()); rt.resizeWatch.observe(screenHost); }
    };

    /* Opens whichever tab holds a node, so the inspector can reveal hidden widgets. */
    rt.reveal = function (id) {
      const s = rt.screens().find((x) => contains(x, id));
      if (s && s.id !== rt.currentScreen) rt.goScreen(s.id);
      let found = document.querySelector(`.gen [data-nid="${id}"]`);
      if (!found) document.querySelectorAll('.gen .g-tabs').forEach((t) => t.openChild && t.openChild(id));
      found = document.querySelector(`.gen [data-nid="${id}"]`);
      return found;
    };
    return rt;
  };

  /* Shared parser for command and conversational input. */
  M.runCommand = function (raw, rt) {
    const text = raw.toLowerCase().trim();
    const f = rt.focus();
    const nodes = rt.plan.workflow.nodes;
    const entity = rt.pack.entities.find((e) => text.includes(e.id.toLowerCase()));
    if (/^(status|where)/.test(text)) return f ? `Step ${nodes.indexOf(f) + 1} of ${nodes.length}: ${f.label}.` : 'The goal has been reached.';
    if (/^(select|show|open)\b/.test(text) && entity) { rt.select(entity.id); return `Selected ${entity.id}, ${entity.name}.`; }
    if (/^goto\b|^go to\b/.test(text)) {
      const st = rt.status();
      const n = nodes.find((x) => x.base.some((b) => text.includes(b)) || text.includes(x.verb.toLowerCase()));
      if (!n) return 'No step has that name. Try status.';
      if (st[n.id] === 'pending') return `${n.verb} is waiting for earlier steps.`;
      rt.count(); rt.setFocus(n.id); return `Moved to ${n.verb}.`;
    }
    if (!f) return 'The goal has already been reached.';
    if (/^(reject|send back|no\b|retry)/.test(text)) {
      if (!f.backTo && !f.retryTo) return `${f.verb} has no earlier step to return to.`;
      rt.decide('reject'); return 'Sent back.';
    }
    if (/^(approve|yes|ok|okay|done|complete|finish|next|proceed|go ahead)/.test(text)) {
      if (f.irreversible && !/^approve/.test(text)) return `${f.verb} is irreversible. Type approve to confirm it.`;
      if (f.irreversible) { rt.decide('approve'); return 'Approved and recorded.'; }
      rt.complete(); return `${f.verb} finished.`;
    }
    return 'I did not understand that. Try done, approve, reject, status, or goto followed by a step name.';
  };
})(window.Morphogen = window.Morphogen || {});
