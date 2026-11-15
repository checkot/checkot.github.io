#!/usr/bin/env node
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const I = require(path.join(ROOT, 'js/core/id-input.js'));
const AREA = JSON.parse(fs.readFileSync(path.join(ROOT, 'areas.json'), 'utf8')).areas;
const MEM = JSON.parse(fs.readFileSync(path.join(ROOT, 'access.json'), 'utf8')).members;
const AL = I.DEFAULT_ALIASES, N = Object.keys(AREA).length;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const R = raw => I.resolveIdInput(raw, AREA, AL, MEM);
const numOnly = Object.keys(AREA).filter(k => /^\d+$/.test(k));
const cf = 'CF4178' in AREA ? 'CF4178' : Object.keys(AREA).find(k => /^CF\d{4}$/.test(k));
const digits = cf.slice(2);

t('exact prefixed', () => assert.deepStrictEqual(R(cf), { status: 'ok', id: cf }));
t('exact number-only (556523, 556525)', () => { assert.equal(R('556523').status, 'ok'); assert.equal(R('556525').id, '556525'); });
t('number-only ids exist', () => assert(numOnly.length >= 3));
t('variants', () => { for (const v of [cf.toLowerCase(), ' ' + cf.slice(0,2) + ' ' + digits + ' ', cf.slice(0,2) + '-' + digits, cf.slice(0,2) + '\u200B' + digits, 'cf_' + digits])
  assert.equal(R(v).id, cf, v); });
t('bangla digits', () => { const bn = digits.replace(/\d/g, d => String.fromCharCode(0x09E6 + +d)); assert.equal(R('CF' + bn).id, cf); assert.equal(I.normalizeIdInput('৫৫৬৫২৩'), '556523'); });
t('digits-only -> suggest', () => { const r = R(digits); assert.equal(r.status, 'suggest'); assert(r.matches.includes(cf)); assert(r.matches.length <= 8); });
t('3 digits -> too-short', () => assert.equal(R('417').status, 'too-short'));
t('unknown letters', () => { assert.equal(R('CF0000').status, 'unknown'); assert.equal(R('ZZ1234').status, 'unknown'); });
t('digits no match -> suggest empty', () => assert.deepStrictEqual(R('9999').matches, []));
t('RF5473 role', () => assert.deepStrictEqual(R('RF5473'), { status: 'role', id: 'RF5473' }));
t('inactive member not role', () => assert.equal(I.resolveIdInput('RF1', {}, AL, [{ id: 'RF1', active: false }]).status, 'unknown'));
t('alias CL6515', () => { assert.equal(R('CL6515').status, 'ok'); assert.equal(R('cl6531').status, 'ok'); });
const base = { areaMap: AREA, aliases: AL, members: MEM, isAdmin: false, mode: 'employee', areaMapCount: N };
const L = o => I.shouldAutoLogout(Object.assign({}, base, o));
t('logout wrong id', () => { assert.strictEqual(L({ savedId: '9999' }), true); assert.strictEqual(L({ savedId: 'CF0000' }), true); assert.strictEqual(L({ savedId: digits }), true); });
t('no logout: manager/listed/empty/alias/number-only', () => { for (const id of ['RF5473', cf, '', 'CL6515', '556523']) assert.strictEqual(L({ savedId: id }), false, id); });
t('no logout: list not loaded', () => { assert.strictEqual(L({ savedId: '9999', areaMapCount: 0 }), false); assert.strictEqual(L({ savedId: '9999', areaMapCount: 49 }), false); });
t('no logout: admin / incharge', () => { assert.strictEqual(L({ savedId: '9999', isAdmin: true }), false); assert.strictEqual(L({ savedId: '9999', mode: 'incharge' }), false); });
t('all active members exempt', () => MEM.filter(m => m.active !== false).forEach(m => assert.strictEqual(L({ savedId: m.id }), false, m.id)));
console.log(n + ' passed');
