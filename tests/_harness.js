// Node harness: loads real app functions (extracted by name) + calculation modules into one vm context.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function extractFn(src, name) {
  const re = new RegExp('(^|\\n)(async\\s+)?function\\s+' + name + '\\s*\\(', 'm');
  const m = re.exec(src); if (!m) throw new Error('fn not found: ' + name);
  let i = src.indexOf('{', m.index + m[0].length), depth = 0, j = i, inS = null, esc = false, lc = false, bc = false;
  for (; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; j++; } continue; }
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { lc = true; continue; }
    if (c === '/' && n === '*') { bc = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index + (m[1] ? m[1].length : 0), j);
}

function makeContext(opts = {}) {
  const store = Object.assign({}, opts.localStorage || {});
  const ctx = {
    console, setTimeout: () => 0, clearTimeout() {}, Date, Math, JSON, Set, Map, Array, Object, String, Number, RegExp, parseInt, parseFloat, isNaN,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    monthIndexMemoryCache: {}, _monthLastNightCache: {}, _monthDatasetMetaCache: {},
    ABSENT_STORE: { longTermLeaves: opts.longTermLeaves || [] },
    document: { readyState: 'complete', addEventListener() {} }, fetch: () => Promise.reject(new Error('no net')),
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const am = fs.readFileSync(path.join(ROOT, 'js/app-main.js'), 'utf8');
  const ut = fs.readFileSync(path.join(ROOT, 'js/core/utils.js'), 'utf8');
  let code = '';
  code += "function cleanPunchValue(val){return String(val==null?'':val).replace(/['\"\u201c\u201d]/g,'').trim();}\n"; // mirrors utils.js (regex has quotes, breaks the scanner)
  ['_parseEmpDayNo', 'getPrevMonthStr', 'resolveEmpAliasId', 'isPunchMissing'].forEach(n => { code += extractFn(ut, n) + '\n'; });
  ['didEmpWorkNightOnLastDay', 'getPrevMonthNightSet', 'hasPrevMonthLastNight', 'getMonthDatasetMeta', 'isPlantOrGovtHolidayDate', '_buildEmpDayMap', 'getTodayDateStr', 'getActiveLongTermLeaves', 'isEmployeeOnApprovedLeave'].forEach(n => { code += extractFn(am, n) + '\n'; });
  vm.runInContext(code, ctx, { filename: 'app-main-extract.js' });
  (opts.files || []).forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return ctx;
}
module.exports = { makeContext, extractFn, ROOT };
