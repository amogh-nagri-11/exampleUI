/* Goal packs: the domain content a plan binds its widgets to.
   All values are simulated sample data. A pack holds no layout or screen
   information, which is what lets the planner assemble any UI around it. */
(function (M) {
  const e = (id, name, status, owner, value, n) => ({ id, name, status, owner, value, n });
  const m = (name, unit, v, lo, hi, target) => ({ name, unit, v, lo, hi, target });
  const a = (sev, tag, msg, age) => ({ sev, tag, msg, age });
  const s = (id, verb, label, caps, extra) => Object.assign({ id, verb, label, caps }, extra);

  M.PACKS = [
    {
      id: 'refinery', sector: 'industrial', domain: 'Process plant', risk: 0.95,
      app: 'Crude Unit 2 Operations', goal: 'Stabilize the overhead pressure excursion on Crude Unit 2',
      keywords: ['pressure', 'refinery', 'crude', 'valve', 'column', 'excursion', 'flare', 'plant', 'stabilize'],
      entityName: 'Instrument', valueName: 'Reading',
      metrics: [m('PI-2204 Overhead pressure', 'bar', 3.42, 2.2, 3.2, 2.7), m('TI-2110 Column top temp', '°C', 148, 120, 145, 136), m('FI-2301 Reflux flow', 'm³/h', 71, 60, 110, 84), m('LI-2402 Drum level', '%', 63, 25, 75, 52)],
      entities: [e('PV-2204', 'Overhead vent valve', 'crit', 'Area 2', '87 % open', 91), e('E-2110', 'Overhead condenser', 'warn', 'Area 2', 'ΔT 6.1 K', 68), e('P-2301A', 'Reflux pump A', 'warn', 'Rotating', '71 m³/h', 57), e('P-2301B', 'Reflux pump B', 'ok', 'Rotating', 'Standby', 12), e('D-2402', 'Overhead drum', 'ok', 'Area 2', '63 % level', 34), e('FV-2118', 'Flare header valve', 'ok', 'Flare', '4 % open', 21)],
      alarms: [a('crit', 'PAH-2204', 'Overhead pressure high', '04:12'), a('warn', 'TAH-2110', 'Column top temperature high', '03:40'), a('warn', 'FAL-2301', 'Reflux flow low', '03:05'), a('ok', 'ZSH-2118', 'Flare valve position normal', '00:48')],
      events: ['14:02:11 PAH-2204 raised at 3.21 bar', '14:02:46 Reflux pump A vibration above 7 mm/s', '14:03:18 Operator M. Okafor acknowledged PAH-2204', '14:04:02 Advisory model flagged condenser fouling', '14:05:30 Standby pump B lined up for start'],
      recs: [{ t: 'Start reflux pump B and raise reflux to 84 m³/h', conf: 0.86, why: 'Pressure tracks reflux loss with 0.91 correlation over the last 12 minutes.' }, { t: 'Reduce furnace outlet temperature by 4 °C', conf: 0.61, why: 'Slower effect, with a 1.8 % throughput penalty.' }, { t: 'Open flare header valve to 15 %', conf: 0.34, why: 'Fast relief, but this is a reportable flaring event.' }],
      checklist: ['Pressure below 3.2 bar for 5 minutes', 'Reflux pump B running with no vibration alarm', 'Flare valve back at normal position', 'Shift supervisor informed'],
      form: [{ l: 'Cause code', o: ['Reflux loss', 'Condenser fouling', 'Feed upset'] }, { l: 'Unit state', o: ['Reduced rate', 'Normal rate'] }, { l: 'Operator note', t: 'text', v: 'Pump A vibration preceded the reflux drop.' }],
      control: { l: 'Reflux flow setpoint', u: 'm³/h', min: 40, max: 120, v: 72, step: 1, metric: 2 },
      actions: ['Start P-2301B', 'Trim furnace 4 °C', 'Hold feed rate', 'Page area engineer'],
      causes: ['Pressure high', ['Reflux flow low', ['Pump A vibration', 'Suction strainer dP']], ['Condenser duty low', ['Tube fouling']]],
      sop: ['SOP-CDU-117 §4.2: Overhead pressure high', 'Confirm the reading against PI-2205 before acting.', 'Restore reflux before reducing heat input.', 'Use the flare only above 3.8 bar.'],
      gate: { title: 'Authorize reflux change above 80 m³/h', detail: 'Moving this setpoint changes column operating limits and is written to the unit log under your name.', who: 'Shift supervisor' },
      steps: [s('detect', 'Detect', 'Confirm the excursion', ['monitor', 'alert']), s('diagnose', 'Diagnose', 'Find the driver', ['diagnose', 'trend']), s('select', 'Select', 'Choose a response', ['advise', 'guide']), s('authorize', 'Authorize', 'Sign off the limit change', ['approve'], { irreversible: true, backTo: 'select' }), s('adjust', 'Adjust', 'Apply the setpoint', ['control', 'trend']), s('verify', 'Verify', 'Prove the unit is stable', ['verify', 'audit'], { retryTo: 'adjust' })]
    },
    {
      id: 'line', sector: 'industrial', domain: 'Discrete manufacturing', risk: 0.7,
      app: 'Line 4 Performance Cell', goal: 'Recover OEE on Line 4 after a spindle bearing fault',
      keywords: ['oee', 'line', 'bearing', 'spindle', 'factory', 'manufacturing', 'machine', 'scrap', 'maintenance', 'cnc'],
      entityName: 'Station', valueName: 'Cycle',
      metrics: [m('OEE Line 4', '%', 61, 72, 100, 83), m('Spindle vibration', 'mm/s', 7.4, 0, 4.5, 2.8), m('First-pass yield', '%', 92.1, 96, 100, 98.2), m('Cycle time', 's', 48, 30, 42, 38)],
      entities: [e('ST-07', 'CNC spindle cell', 'crit', 'Maintenance', '48 s', 88), e('ST-06', 'Deburr robot', 'warn', 'Cell B', '41 s', 62), e('ST-08', 'Leak test', 'warn', 'Quality', '39 s', 55), e('ST-05', 'Infeed conveyor', 'ok', 'Cell A', '36 s', 24), e('ST-09', 'Laser marking', 'ok', 'Cell C', '22 s', 18), e('ST-10', 'Palletizer', 'ok', 'Cell C', '31 s', 15)],
      alarms: [a('crit', 'VIB-07', 'Spindle bearing vibration above limit', '11:20'), a('warn', 'QA-08', 'Leak test rejects rising', '08:02'), a('warn', 'BUF-06', 'Buffer upstream of ST-07 at 92 %', '05:44')],
      events: ['09:41:08 ST-07 vibration crossed 4.5 mm/s', '09:44:32 Scrap bin 3 flagged by vision check', '09:47:10 Spare bearing SKF-7208 reserved', '09:49:55 Maintenance planner opened WO-55182', '09:52:03 Buffer before ST-07 reached 92 %'],
      recs: [{ t: 'Swap the spindle bearing at the 10:30 changeover', conf: 0.81, why: 'Vibration growth predicts failure in 3.5 hours. The changeover costs 22 minutes less than a stop now.' }, { t: 'Route 30 % of parts to Line 5', conf: 0.57, why: 'Keeps the order on time and adds a second setup.' }, { t: 'Run ST-07 at 80 % feed until shift end', conf: 0.42, why: 'Avoids a stop and lowers throughput by 12 %.' }],
      checklist: ['Vibration below 4.5 mm/s after restart', 'First article passes CMM check', 'Scrap bin 3 quarantined', 'Work order WO-55182 closed'],
      form: [{ l: 'Loss category', o: ['Unplanned stop', 'Speed loss', 'Quality loss'] }, { l: 'Part number', o: ['HX-4410', 'HX-4412'] }, { l: 'Technician note', t: 'text', v: 'Bearing noise audible at 6000 rpm.' }],
      control: { l: 'ST-07 feed override', u: '%', min: 50, max: 110, v: 100, step: 1, metric: 3 },
      actions: ['Reserve changeover slot', 'Quarantine bin 3', 'Route to Line 5', 'Call maintenance'],
      causes: ['OEE loss', ['Availability', ['Spindle bearing wear']], ['Quality', ['Chatter marks', 'Leak test rejects']]],
      sop: ['MNT-204: Spindle bearing replacement', 'Lock out ST-07 and verify zero energy.', 'Replace the bearing as a matched pair.', 'Run a 20-minute warm-up before first article.'],
      gate: { title: 'Approve a 42-minute stop on Line 4', detail: 'The stop delays order 88213 by one shift unless Line 5 takes the overflow.', who: 'Production manager' },
      steps: [s('assess', 'Assess', 'Size the OEE loss', ['monitor', 'compare']), s('locate', 'Locate', 'Find the constraint', ['locate', 'diagnose']), s('schedule', 'Schedule', 'Fit the repair in', ['plan', 'advise']), s('approve', 'Approve', 'Accept the stop', ['approve'], { irreversible: true, backTo: 'schedule' }), s('rampup', 'Ramp up', 'Return to rate', ['control', 'trend']), s('close', 'Close', 'Record the recovery', ['verify', 'submit', 'audit'], { retryTo: 'rampup' })]
    },
    {
      id: 'grid', sector: 'industrial', domain: 'Power distribution', risk: 0.9,
      app: 'Feeder Restoration Desk', goal: 'Restore Feeder 12 after a storm fault with crews in the field',
      keywords: ['power', 'grid', 'feeder', 'outage', 'storm', 'crew', 'substation', 'restore', 'energy', 'utility'],
      entityName: 'Switch', valueName: 'Customers',
      metrics: [m('Customers without power', '', 8420, 0, 500, 300), m('Feeder 12 load', 'MW', 6.8, 8, 22, 15.2), m('Bus voltage', 'kV', 11.2, 10.8, 11.6, 11.1), m('Estimated SAIDI', 'min', 38, 0, 25, 16)],
      entities: [e('SW-1207', 'Mid-line recloser', 'crit', 'Crew Delta', '3 180 cust.', 92), e('SW-1211', 'Tie to Feeder 9', 'warn', 'Control room', '2 460 cust.', 66), e('TX-1219', 'Pole transformer', 'warn', 'Crew Echo', '1 120 cust.', 59), e('SW-1203', 'Substation breaker', 'ok', 'Control room', '0 cust.', 14), e('SW-1215', 'Lateral fuse', 'warn', 'Crew Delta', '1 660 cust.', 48), e('CAP-12', 'Capacitor bank', 'ok', 'Automation', '0 cust.', 8)],
      alarms: [a('crit', 'F12-LOCKOUT', 'Recloser SW-1207 locked out', '26:10'), a('warn', 'F9-LOAD', 'Feeder 9 at 88 % of rating', '12:32'), a('warn', 'WX-41', 'Gusts above 70 km/h at Sector 3', '09:18')],
      events: ['02:14:02 SW-1207 lockout after three shots', '02:18:44 Crew Delta dispatched to pole 1207', '02:29:10 Fault indicator tripped between poles 88 and 92', '02:33:51 Feeder 9 headroom recalculated at 2.1 MW', '02:38:06 Crew Delta on site'],
      recs: [{ t: 'Isolate poles 88–92, then back-feed through SW-1211', conf: 0.88, why: 'Restores 5 640 customers and leaves Feeder 9 at 96 % of rating.' }, { t: 'Wait for a full repair by Crew Delta', conf: 0.48, why: 'No switching risk, with a restoration estimate of 4.5 hours.' }, { t: 'Shed Feeder 9 lateral 3 before back-feed', conf: 0.39, why: 'Adds margin and interrupts 410 customers.' }],
      checklist: ['Crew tags cleared at SW-1207', 'Feeder 9 below 95 % of rating', 'Voltage within ±5 % at feeder end', 'Outage record updated'],
      form: [{ l: 'Fault type', o: ['Tree contact', 'Conductor down', 'Equipment failure'] }, { l: 'Assigned crew', o: ['Delta', 'Echo', 'Foxtrot'] }, { l: 'Field note', t: 'text', v: 'Broken crossarm at pole 90.' }],
      control: { l: 'Back-feed load transfer', u: 'MW', min: 0, max: 18, v: 7, step: 0.5, metric: 1 },
      actions: ['Open SW-1207', 'Close SW-1211', 'Dispatch Crew Echo', 'Notify customers'],
      causes: ['Feeder lockout', ['Permanent fault', ['Tree contact, pole 90', 'Broken crossarm']], ['Limited back-feed', ['Feeder 9 headroom']]],
      sop: ['OPS-77: Switching order', 'Confirm crew clearance before any close.', 'Open before close: no parallel feeders.', 'Read back every step to the field.'],
      gate: { title: 'Release switching order SO-3381', detail: 'This energizes equipment near field crews. Crew Delta has confirmed clearance by radio.', who: 'Duty controller' },
      steps: [s('scope', 'Scope', 'Map the outage', ['locate', 'alert']), s('isolate', 'Isolate', 'Bound the fault', ['diagnose', 'inspect']), s('dispatch', 'Dispatch', 'Assign field crews', ['plan', 'triage']), s('release', 'Release', 'Authorize switching', ['approve', 'guide'], { irreversible: true, backTo: 'isolate' }), s('transfer', 'Transfer', 'Back-feed the load', ['control', 'monitor']), s('confirm', 'Confirm', 'Close the outage', ['verify', 'audit'], { retryTo: 'transfer' })]
    },
    {
      id: 'warehouse', sector: 'industrial', domain: 'Logistics', risk: 0.45,
      app: 'Fulfillment Control Tower', goal: 'Clear the dock-to-stock backlog before the 18:00 carrier cutoff',
      keywords: ['warehouse', 'dock', 'logistics', 'backlog', 'carrier', 'pallet', 'fulfillment', 'inventory', 'shipping', 'robot'],
      entityName: 'Zone', valueName: 'Backlog',
      metrics: [m('Dock-to-stock time', 'h', 7.6, 0, 4, 3.2), m('Open inbound pallets', '', 412, 0, 180, 120), m('Picks per hour', '', 148, 170, 300, 196), m('AMR fleet available', '%', 71, 80, 100, 91)],
      entities: [e('DK-03', 'Inbound dock 3', 'crit', 'A. Ruiz', '164 pallets', 90), e('ZN-B', 'Bulk reserve B', 'warn', 'S. Lindqvist', '102 pallets', 71), e('AMR-G2', 'AMR fleet group 2', 'warn', 'Automation', '6 offline', 64), e('ZN-F', 'Forward pick F', 'ok', 'T. Haddad', '38 pallets', 28), e('DK-01', 'Inbound dock 1', 'warn', 'A. Ruiz', '74 pallets', 52), e('PK-2', 'Pack wall 2', 'ok', 'J. Mensah', '34 pallets', 20)],
      alarms: [a('crit', 'CUT-18', 'Carrier cutoff at risk for 212 orders', '00:32'), a('warn', 'AMR-G2', 'Six robots offline for charging', '14:10'), a('warn', 'DK-03', 'Dock 3 over planned occupancy', '31:00')],
      events: ['13:10:44 Trailer 8821 unloaded early at Dock 3', '13:32:08 AMR group 2 entered low-battery mode', '13:41:27 Bulk reserve B reached 94 % slots', '13:55:02 Wave 14 released with 212 cutoff orders', '14:02:19 Labor pool has 9 unassigned associates'],
      recs: [{ t: 'Move 9 associates to Dock 3 and pause Wave 15', conf: 0.79, why: 'Clears 160 pallets by 16:40 and leaves 80 minutes of cutoff margin.' }, { t: 'Rotate AMR group 2 through fast charge', conf: 0.66, why: 'Recovers 6 robots in 35 minutes at a lower pick rate.' }, { t: 'Add a second carrier pickup at 19:00', conf: 0.41, why: 'Protects orders and adds about $1 900.' }],
      checklist: ['Backlog below 180 pallets', 'Cutoff orders all assigned to a wave', 'AMR availability above 80 %', 'Carrier notified of final count'],
      form: [{ l: 'Reassign to', o: ['Dock 3', 'Bulk reserve B', 'Pack wall 2'] }, { l: 'Shift', o: ['Day', 'Swing'] }, { l: 'Lead note', t: 'text', v: 'Prioritize trailers holding cutoff SKUs.' }],
      control: { l: 'Labor allocated to inbound', u: '%', min: 10, max: 80, v: 32, step: 1, metric: 1 },
      actions: ['Pause Wave 15', 'Fast-charge group 2', 'Open Dock 4', 'Book 19:00 pickup'],
      causes: ['Dock backlog', ['Inbound surge', ['Early trailers']], ['Low putaway rate', ['AMR charging', 'Reserve B full']]],
      sop: ['WH-31: Cutoff recovery', 'Protect cutoff orders first.', 'Keep one aisle clear in each reserve zone.', 'Tell the carrier before 16:30 about any change.'],
      gate: { title: 'Commit the 19:00 carrier pickup', detail: 'The carrier charges the fee once booked, whether or not the trailer fills.', who: 'Site lead' },
      steps: [s('view', 'Survey', 'See where the backlog sits', ['locate', 'monitor']), s('rank', 'Rank', 'Rank the blocked zones', ['triage', 'compare']), s('rebalance', 'Rebalance', 'Reassign labor and robots', ['plan', 'control']), s('commit', 'Commit', 'Book the extra carrier', ['approve'], { irreversible: true, backTo: 'rebalance' }), s('track', 'Track', 'Watch the burn-down', ['trend', 'alert']), s('handoff', 'Hand off', 'Brief the next shift', ['submit', 'audit'], { retryTo: 'track' })]
    },
    {
      id: 'procure', sector: 'enterprise', domain: 'Procurement', risk: 0.6,
      app: 'Sourcing Exceptions', goal: 'Decide a $2.4M sole-source contract exception for Halden Sensors',
      keywords: ['contract', 'supplier', 'procurement', 'sourcing', 'vendor', 'purchase', 'exception', 'negotiate', 'spend'],
      entityName: 'Clause', valueName: 'Exposure',
      metrics: [m('Contract value', '$M', 2.4, 0, 2, 2.1), m('Off-benchmark premium', '%', 11.8, 0, 6, 5.5), m('Supplier risk score', '/100', 64, 0, 50, 46), m('Days to expiry', 'd', 9, 14, 90, 30)],
      entities: [e('CL-14', 'Liability cap', 'crit', 'Legal', '$600k gap', 86), e('CL-07', 'Price escalator', 'warn', 'Finance', '$310k', 71), e('CL-22', 'Single-site supply', 'warn', 'Supply risk', '$480k', 67), e('CL-03', 'Payment terms', 'ok', 'Finance', '$42k', 22), e('CL-09', 'Data handling', 'ok', 'Security', 'Passed', 15), e('CL-18', 'Termination right', 'warn', 'Legal', '$150k', 44)],
      alarms: [a('crit', 'POL-4.2', 'Above the sole-source limit of $2.0M', '2 d'), a('warn', 'RISK-11', 'Supplier has one production site', '5 d'), a('warn', 'EXP-9', 'Current agreement expires in 9 days', '9 d')],
      events: ['Oct 28 Request SR-2291 submitted by Engineering', 'Oct 30 Legal flagged the liability cap', 'Nov 01 Benchmark returned an 11.8 % premium', 'Nov 03 Halden offered a 4 % volume rebate', 'Nov 04 CFO office requested a decision by Nov 12'],
      recs: [{ t: 'Approve for 18 months with a 4 % rebate and a higher liability cap', conf: 0.77, why: 'Meets the engineering date and cuts the premium to 7.3 %.' }, { t: 'Approve 12 months and start a second-source qualification', conf: 0.64, why: 'Lowers the single-site risk and adds $180k of qualification cost.' }, { t: 'Reject and run a 6-week tender', conf: 0.29, why: 'Policy-clean, with a 5-week gap in supply.' }],
      checklist: ['Legal accepts the liability wording', 'Finance confirms budget code', 'Second-source plan attached', 'Policy exception logged'],
      form: [{ l: 'Exception basis', o: ['Technical lock-in', 'Time-critical', 'IP ownership'] }, { l: 'Term', o: ['12 months', '18 months', '24 months'] }, { l: 'Justification', t: 'text', v: 'Only qualified source for the H7 sensor family.' }],
      control: { l: 'Negotiated rebate', u: '%', min: 0, max: 12, v: 2, step: 0.5, metric: 1 },
      actions: ['Request legal redline', 'Send counter-offer', 'Attach benchmark', 'Loop in CFO office'],
      causes: ['Policy exception', ['Above limit', ['Volume growth 40 %']], ['No alternative', ['H7 qualification', 'Single site']]],
      sop: ['PROC-4.2: Sole-source exceptions', 'Over $2.0M requires CFO-office approval.', 'Attach a market benchmark under 90 days old.', 'Record any second-source plan.'],
      gate: { title: 'Approve exception SR-2291 for $2.4M', detail: 'Approval commits the budget and records you as the accountable owner under policy 4.2.', who: 'VP Procurement' },
      steps: [s('review', 'Review', 'Read the request', ['inspect', 'alert']), s('benchmark', 'Benchmark', 'Compare the market price', ['compare', 'trend']), s('risk', 'Weigh risk', 'Score clause exposure', ['triage', 'diagnose']), s('negotiate', 'Negotiate', 'Set counter terms', ['advise', 'control']), s('decide', 'Decide', 'Sign the exception', ['approve', 'guide'], { irreversible: true, backTo: 'negotiate' }), s('record', 'Record', 'File the justification', ['submit', 'audit'])]
    },
    {
      id: 'close', sector: 'enterprise', domain: 'Finance', risk: 0.55,
      app: 'Q3 Close Workspace', goal: 'Reconcile a $1.2M intercompany variance before the Q3 close',
      keywords: ['finance', 'close', 'variance', 'reconcile', 'ledger', 'journal', 'quarter', 'audit', 'accounting', 'budget'],
      entityName: 'Account', valueName: 'Variance',
      metrics: [m('Unreconciled variance', '$k', 1210, 0, 100, 60), m('Accounts reconciled', '%', 78, 95, 100, 98), m('Days to close', 'd', 2, 3, 15, 4), m('Open journal entries', '', 41, 0, 10, 6)],
      entities: [e('IC-2140', 'Intercompany DE ↔ US', 'crit', 'R. Tanaka', '$846k', 93), e('FX-7710', 'FX revaluation', 'warn', 'L. Moreau', '$212k', 66), e('AP-2010', 'Accrued payables', 'warn', 'B. Adeyemi', '$96k', 49), e('RV-4000', 'Deferred revenue', 'ok', 'C. Novak', '$38k', 26), e('FA-1500', 'Fixed assets', 'ok', 'P. Iyer', '$12k', 12), e('TX-2200', 'Tax provision', 'warn', 'L. Moreau', '$18k', 38)],
      alarms: [a('crit', 'REC-IC', 'Intercompany out of balance above tolerance', '3 d'), a('warn', 'FX-RATE', 'DE entity used the prior-month FX rate', '2 d'), a('warn', 'JE-41', '41 journal entries await review', '1 d')],
      events: ['Oct 02 Subledger close finished in 3 of 4 entities', 'Oct 03 Matching engine left 212 items unmatched', 'Oct 03 FX rate mismatch found in the DE entity', 'Oct 04 R. Tanaka proposed journal JE-8841', 'Oct 04 Auditors requested intercompany support'],
      recs: [{ t: 'Rerun DE revaluation with the period-end FX rate', conf: 0.9, why: 'Explains $620k of the variance. 188 of 212 unmatched items share this cause.' }, { t: 'Post top-side JE-8841 for $226k', conf: 0.58, why: 'Clears timing differences, and needs reversal next period.' }, { t: 'Escalate the remainder to the DE controller', conf: 0.46, why: 'Remainder is under the materiality threshold but above tolerance.' }],
      checklist: ['Variance within $100k tolerance', 'Support attached to each journal', 'Preparer and reviewer are different people', 'Auditor request answered'],
      form: [{ l: 'Journal type', o: ['Reclass', 'Accrual', 'Top-side adjustment'] }, { l: 'Auto-reverse', o: ['Next period', 'No'] }, { l: 'Support note', t: 'text', v: 'Period-end rate 1.0842 applied to DE balances.' }],
      control: { l: 'Matching tolerance', u: '$', min: 0, max: 500, v: 250, step: 10, metric: 3 },
      actions: ['Rerun revaluation', 'Rematch items', 'Request support', 'Notify controller'],
      causes: ['$1.2M variance', ['FX rate mismatch', ['Prior-month rate in DE']], ['Timing', ['Late invoice batch', 'Cutoff difference']]],
      sop: ['FIN-12: Intercompany policy', 'Tolerance is $100k per entity pair.', 'Top-side entries require controller review.', 'Keep support with the journal for 7 years.'],
      gate: { title: 'Post journal JE-8841 to the general ledger', detail: 'Posting writes to the Q3 ledger and appears in the audit sample. Segregation of duties applies.', who: 'Group controller' },
      steps: [s('triage', 'Triage', 'Rank the open accounts', ['triage', 'alert']), s('trace', 'Trace', 'Find the variance driver', ['diagnose', 'inspect']), s('propose', 'Propose', 'Draft the correction', ['advise', 'submit']), s('post', 'Post', 'Approve the journal', ['approve'], { irreversible: true, backTo: 'propose' }), s('recheck', 'Recheck', 'Rerun matching', ['trend', 'compare']), s('certify', 'Certify', 'Certify the account', ['verify', 'audit'], { retryTo: 'recheck' })]
    },
    {
      id: 'incident', sector: 'enterprise', domain: 'Site reliability', risk: 0.8,
      app: 'Incident Command', goal: 'Resolve the P1 checkout outage and restore payment success',
      keywords: ['incident', 'outage', 'p1', 'checkout', 'payment', 'latency', 'rollback', 'deploy', 'sre', 'kubernetes', 'server'],
      entityName: 'Service', valueName: 'Error rate',
      metrics: [m('Payment success', '%', 71.4, 99, 100, 99.4), m('Checkout p99 latency', 'ms', 4120, 0, 800, 520), m('Error budget burn', '×', 38, 0, 2, 1.1), m('Queue depth', 'k', 96, 0, 20, 8)],
      entities: [e('pay-gateway', 'Payment gateway', 'crit', 'Payments', '28.6 %', 92), e('ledger-db', 'Ledger primary', 'warn', 'Data', '6.2 %', 67), e('risk-score', 'Fraud scoring', 'warn', 'Trust', '3.1 %', 55), e('cart-api', 'Cart API', 'ok', 'Commerce', '0.4 %', 18), e('edge-lb', 'Edge load balancer', 'ok', 'Platform', '0.1 %', 10), e('notify', 'Notifications', 'ok', 'Growth', '0.2 %', 8)],
      alarms: [a('crit', 'SLO-PAY', 'Payment success under 99 %', '09:41'), a('crit', 'DB-CONN', 'Ledger connection pool exhausted', '08:58'), a('warn', 'DEPLOY', 'pay-gateway v4.18 rolled out 11 minutes ago', '11:02')],
      events: ['21:04:15 pay-gateway v4.18 reached 100 % of pods', '21:06:02 Connection pool saturated on ledger-db', '21:07:30 SEV-1 declared and channel opened', '21:09:12 Agent correlated errors with the v4.18 rollout', '21:12:44 Status page set to degraded'],
      recs: [{ t: 'Roll pay-gateway back to v4.17', conf: 0.92, why: 'Errors began 94 seconds after v4.18 and the diff adds a connection per retry.' }, { t: 'Raise the ledger pool size to 400', conf: 0.51, why: 'Buys time but increases load on an already hot primary.' }, { t: 'Shift 40 % of traffic to the backup processor', conf: 0.47, why: 'Raises fees by 0.3 % and reduces gateway load.' }],
      checklist: ['Payment success above 99 % for 10 minutes', 'Queue depth under 20k', 'Status page updated', 'Post-incident review scheduled'],
      form: [{ l: 'Severity', o: ['SEV-1', 'SEV-2'] }, { l: 'Customer impact', o: ['Payments failing', 'Slow checkout'] }, { l: 'Status update', t: 'text', v: 'We are rolling back a change affecting payments.' }],
      control: { l: 'Traffic on v4.17', u: '%', min: 0, max: 100, v: 0, step: 5, metric: 0 },
      actions: ['Roll back v4.18', 'Scale ledger pool', 'Shift traffic', 'Update status page'],
      causes: ['Payment failures', ['Pool exhausted', ['v4.18 retry leak']], ['Slow ledger', ['Lock contention', 'Hot primary']]],
      sop: ['RB-PAY-09: Gateway rollback', 'Freeze deploys for the affected service.', 'Roll back in steps of 25 % and watch p99.', 'Post a status update every 15 minutes.'],
      gate: { title: 'Execute production rollback of pay-gateway', detail: 'In-flight retries are dropped during the rollback. About 1 200 customers may need to retry.', who: 'Incident commander' },
      steps: [s('declare', 'Declare', 'Confirm impact', ['alert', 'monitor']), s('correlate', 'Correlate', 'Link signal to change', ['diagnose', 'trend']), s('mitigate', 'Choose fix', 'Pick the mitigation', ['advise', 'guide']), s('execute', 'Execute', 'Authorize rollback', ['approve'], { irreversible: true, backTo: 'mitigate' }), s('shift', 'Shift', 'Move traffic over', ['control', 'monitor']), s('resolve', 'Resolve', 'Confirm recovery', ['verify', 'audit'], { retryTo: 'shift' })]
    },
    {
      id: 'compliance', sector: 'enterprise', domain: 'Compliance', risk: 0.5,
      app: 'Audit Readiness Room', goal: 'Assemble ISO 27001 evidence and close control gaps before the audit',
      keywords: ['compliance', 'iso', '27001', 'evidence', 'gap', 'security', 'policy', 'regulator', 'certification'],
      entityName: 'Control', valueName: 'Evidence',
      metrics: [m('Controls with evidence', '%', 74, 95, 100, 97), m('Open gaps', '', 23, 0, 5, 3), m('Days to audit', 'd', 12, 14, 90, 20), m('Stale evidence', '%', 18, 0, 5, 3)],
      entities: [e('A.8.15', 'Logging', 'crit', 'Platform', '2 of 7', 88), e('A.5.23', 'Cloud service use', 'warn', 'Security', '4 of 9', 69), e('A.8.8', 'Vulnerability mgmt', 'warn', 'AppSec', '5 of 8', 58), e('A.6.3', 'Security training', 'ok', 'People', '6 of 6', 14), e('A.5.30', 'ICT continuity', 'warn', 'SRE', '3 of 5', 46), e('A.8.24', 'Cryptography', 'ok', 'Security', '4 of 4', 12)],
      alarms: [a('crit', 'GAP-815', 'Log retention below the 12-month policy', '6 d'), a('warn', 'STALE-18', '18 % of evidence is older than 90 days', '4 d'), a('warn', 'OWN-5', 'Five controls have no owner', '2 d')],
      events: ['Oct 19 Evidence collector connected to cloud logs', 'Oct 22 Agent matched 214 artifacts to controls', 'Oct 26 Retention gap found on control A.8.15', 'Nov 01 Training records imported from the HR system', 'Nov 03 Auditor sent the sampling list'],
      recs: [{ t: 'Extend log retention to 13 months and backfill from archive', conf: 0.84, why: 'Closes the only major nonconformity risk, at about $2 100 per month.' }, { t: 'Assign owners to five controls from the RACI', conf: 0.72, why: 'A low-effort fix that auditors commonly sample.' }, { t: 'Accept risk on A.5.30 until Q1', conf: 0.31, why: 'Possible, but likely to raise a minor finding.' }],
      checklist: ['Every control has an owner', 'No evidence older than 90 days', 'Statement of Applicability approved', 'Sampling list fully answered'],
      form: [{ l: 'Treatment', o: ['Remediate', 'Accept', 'Transfer'] }, { l: 'Due', o: ['Before audit', 'Q1'] }, { l: 'Rationale', t: 'text', v: 'Retention extended through the storage lifecycle policy.' }],
      control: { l: 'Evidence freshness window', u: 'd', min: 30, max: 180, v: 120, step: 5, metric: 3 },
      actions: ['Extend retention', 'Assign owners', 'Request artifacts', 'Book mock audit'],
      causes: ['Audit gaps', ['Missing evidence', ['Log retention', 'Manual collection']], ['Accountability', ['Unowned controls']]],
      sop: ['ISMS-02: Evidence standard', 'Evidence must be dated and traceable to one control.', 'Refresh evidence at least every 90 days.', 'Management approves accepted risk.'],
      gate: { title: 'Approve the Statement of Applicability v7', detail: 'This is the signed basis of the audit scope, and changing it after sign-off requires a new review.', who: 'CISO' },
      steps: [s('inventory', 'Inventory', 'See control status', ['monitor', 'locate']), s('prioritize', 'Prioritize', 'Rank the gaps', ['triage', 'compare']), s('remediate', 'Remediate', 'Plan each fix', ['plan', 'advise']), s('collect', 'Collect', 'Attach evidence', ['submit', 'inspect']), s('signoff', 'Sign off', 'Approve the scope', ['approve', 'guide'], { irreversible: true, backTo: 'remediate' }), s('package', 'Package', 'Release to the auditor', ['verify', 'audit'])]
    }
  ];

  /* Reads a typed goal. Returns the best pack, the words that matched it, and any
     context changes the wording implies. Transparent keyword matching, not an LLM. */
  M.parseGoal = function (text, fallbackId) {
    const words = (text || '').toLowerCase();
    let best = null, hits = [];
    for (const p of M.PACKS) {
      const h = p.keywords.filter((k) => new RegExp('\\b' + k + '\\b').test(words));
      if (h.length > hits.length) { best = p; hits = h; }
    }
    const ctx = {};
    if (/\b(urgent|emergency|immediately|asap)\b/.test(words)) ctx.urgency = 0.92;
    if (/\b(routine|planned|calm)\b/.test(words)) ctx.urgency = 0.15;
    if (/\b(novice|new hire|trainee|first time|junior)\b/.test(words)) ctx.expertise = 0.12;
    if (/\b(expert|veteran|senior|specialist)\b/.test(words)) ctx.expertise = 0.9;
    if (/\b(autonomous|automate|automatically)\b/.test(words)) ctx.autonomy = 0.88;
    if (/\b(manual|by hand|no agent)\b/.test(words)) ctx.autonomy = 0.1;
    if (/\b(phone|mobile|handheld|field)\b/.test(words)) ctx.device = 'handheld';
    if (/\b(tablet|ipad)\b/.test(words)) ctx.device = 'tablet';
    if (/\b(wall|control room|mission control)\b/.test(words)) ctx.device = 'wall';
    return { pack: best || M.PACKS.find((p) => p.id === fallbackId) || M.PACKS[0], hits, matched: !!best, ctx };
  };
})(typeof window !== 'undefined' ? (window.Morphogen = window.Morphogen || {}) : (globalThis.Morphogen = globalThis.Morphogen || {}));
