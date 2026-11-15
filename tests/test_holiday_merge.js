#!/usr/bin/env node
const assert = require('assert'); const M = require('../js/admin/admin-holiday-merge.js');
const H = (custom, cancelled, byMonth) => ({ custom: custom || [], cancelled: cancelled || [], byMonth: byMonth || {} });
// 1) the reported bug: stale device (knows only 04-OCT) saves an unrelated change -> server's 07-NOV must survive
let r = M.merge(H(['04-OCT-2026']), H(['04-OCT-2026']), H(['04-OCT-2026', '07-NOV-2026']));
assert.deepStrictEqual(r.custom, ['04-OCT-2026', '07-NOV-2026']);
// 2) admin adds 07-NOV while another device added 20-NOV: both kept
r = M.merge(H(['04-OCT-2026']), H(['04-OCT-2026', '07-NOV-2026']), H(['04-OCT-2026', '20-NOV-2026']));
assert.deepStrictEqual(r.custom.sort(), ['04-OCT-2026', '07-NOV-2026', '20-NOV-2026']);
// 3) admin removes a custom holiday on purpose: removed, others kept
r = M.merge(H(['04-OCT-2026', '07-NOV-2026']), H(['04-OCT-2026']), H(['04-OCT-2026', '07-NOV-2026', '20-NOV-2026']));
assert.deepStrictEqual(r.custom, ['04-OCT-2026', '20-NOV-2026']);
// 4) cancelled list (govt holiday turned into working day) is merged the same way
r = M.merge(H([], []), H([], ['05-NOV-2026']), H([], ['06-NOV-2026']));
assert.deepStrictEqual(r.cancelled.sort(), ['05-NOV-2026', '06-NOV-2026']);
// 5) re-adding a cancelled date: leaves cancelled, goes to custom
r = M.merge(H([], ['07-NOV-2026']), H(['07-NOV-2026'], []), H([], ['07-NOV-2026']));
assert.deepStrictEqual([r.custom, r.cancelled], [['07-NOV-2026'], []]);
// 6) byMonth: only changed months overwrite; untouched months stay as on server
r = M.merge(H([], [], { '2026-10': { a: 1 } }), H([], [], { '2026-10': { a: 1 }, '2026-11': { b: 2 } }), H([], [], { '2026-10': { a: 1 }, '2026-12': { c: 3 } }));
assert.deepStrictEqual(Object.keys(r.byMonth).sort(), ['2026-10', '2026-11', '2026-12']);
// 7) empty / missing input never throws and never drops server data
r = M.merge(null, undefined, H(['07-NOV-2026']));
assert.deepStrictEqual(r.custom, ['07-NOV-2026']);
console.log('✅ test_holiday_merge OK (7 cases)');
