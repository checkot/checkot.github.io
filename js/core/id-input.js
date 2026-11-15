/* ID input helpers: pure functions, no DOM. Works in browser (window.RppfIdInput) and Node (require). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RppfIdInput = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';
  var DEFAULT_ALIASES = { 'CL6515': '556515', '556515': 'CL6515', 'CL6531': '556531', '556531': 'CL6531' };
  var MAX_SUGGEST = 8, MIN_DIGITS = 4, MIN_LIST_SIZE = 50;

  function normalizeIdInput(raw) {
    var s = String(raw == null ? '' : raw).trim();
    s = s.replace(/[\u09E6-\u09EF]/g, function (c) { return String(c.charCodeAt(0) - 0x09E6); });
    s = s.toUpperCase().replace(/[\s\u200B-\u200D\uFEFF\u00A0\-_.]/g, '');
    return s.replace(/[^A-Z0-9]/g, '');
  }
  function has(map, k) { return !!map && Object.prototype.hasOwnProperty.call(map, k) && !!map[k]; }
  function isListed(id, areaMap, aliases) {
    if (!id) return false;
    var u = normalizeIdInput(id), al = aliases || DEFAULT_ALIASES;
    return has(areaMap, u) || (al[u] ? has(areaMap, al[u]) : false);
  }
  function listedKey(id, areaMap, aliases) {
    var u = normalizeIdInput(id), al = aliases || DEFAULT_ALIASES;
    if (has(areaMap, u)) return u;
    if (al[u] && has(areaMap, al[u])) return al[u];
    return null;
  }
  function isActiveMember(id, members) {
    var u = normalizeIdInput(id);
    if (!u || !members) return false;
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (m && m.active !== false && normalizeIdInput(m.id) === u) return true;
    }
    return false;
  }
  function resolveIdInput(raw, areaMap, aliases, members) {
    var id = normalizeIdInput(raw);
    if (!id) return { status: 'unknown', id: '' };
    var key = listedKey(id, areaMap, aliases);
    if (key) return { status: 'ok', id: key === id ? id : (has(areaMap, id) ? id : key) };
    if (isActiveMember(id, members)) return { status: 'role', id: id };
    if (/^[0-9]+$/.test(id)) {
      if (id.length < MIN_DIGITS) return { status: 'too-short', digits: id };
      var m = [];
      Object.keys(areaMap || {}).forEach(function (k) {
        if (/^[A-Z]+[0-9]+$/.test(k) && areaMap[k] && k.slice(-id.length) === id && /^[A-Z]+$/.test(k.slice(0, k.length - id.length))) m.push(k);
      });
      m.sort();
      return { status: 'suggest', digits: id, matches: m.slice(0, MAX_SUGGEST), total: m.length };
    }
    return { status: 'unknown', id: id };
  }
  function shouldAutoLogout(o) {
    o = o || {};
    var id = normalizeIdInput(o.savedId);
    if (!id) return false;
    if (!(o.areaMapCount >= MIN_LIST_SIZE)) return false;
    if (o.isAdmin) return false;
    if (o.mode === 'incharge') return false;
    if (isListed(id, o.areaMap, o.aliases)) return false;
    if (isActiveMember(id, o.members)) return false;
    return true;
  }
  return { normalizeIdInput: normalizeIdInput, resolveIdInput: resolveIdInput, shouldAutoLogout: shouldAutoLogout,
           isListed: isListed, isActiveMember: isActiveMember, DEFAULT_ALIASES: DEFAULT_ALIASES, MAX_SUGGEST: MAX_SUGGEST };
});
