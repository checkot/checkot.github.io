/* ==========================================================================
   access-crypto.js - PIN hashing helpers shared by index.html and admin.html
   --------------------------------------------------------------------------
   Used by the data-driven access list (access.json). No secrets live here.
   Scheme : PBKDF2-HMAC-SHA256, per-member random salt, 100 000 iterations,
            input = "<DEPT>|<ID>|<PIN>"  (so the same PIN hashes differently
            for every member and every department).
   NOTE   : this is a client-side gate on a static site. A short numeric PIN
            stored (even hashed) in a public JSON can still be brute-forced
            offline, which is why Manager / Executive / Admin roles must use
            PINs of 6+ digits and why "weak" PINs are flagged in the Access tab.
   ========================================================================== */
(function (g) {
  'use strict';
  var ITER = 100000;
  var ALGO = 'pbkdf2-sha256-' + ITER;
  var STRONG_ROLE_RE = /manager|executive|officer|admin|erp/i;

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function randomHex(bytes) {
    var a = new Uint8Array(bytes || 16);
    g.crypto.getRandomValues(a);
    return hex(a);
  }
  function normalizePin(raw) {
    return String(raw == null ? '' : raw).trim().replace(/[\u09E6-\u09EF]/g, function (d) { return '\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF'.indexOf(d); });
  }
  function available() { return !!(g.crypto && g.crypto.subtle && g.TextEncoder); }

  async function hashPin(pin, salt, id, dept) {
    if (!available()) throw new Error('Secure crypto is not available in this browser context (needs https).');
    var enc = new TextEncoder();
    var pw = enc.encode(String(dept || '').toUpperCase() + '|' + String(id || '').toUpperCase().trim() + '|' + normalizePin(pin));
    var key = await g.crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
    var bits = await g.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(String(salt || '')), iterations: ITER }, key, 256);
    return hex(bits);
  }
  function constEq(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a.length !== b.length) return false;
    var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }
  async function verifyPin(pin, member) {
    if (!member || !member.pinHash || !member.pinSalt) return false;
    try { return constEq(await hashPin(pin, member.pinSalt, member.id, member.dept), member.pinHash); } catch (e) { return false; }
  }
  /* creates {pinHash, pinSalt, pinAlgo} for a member */
  async function makePinRecord(pin, id, dept) {
    var salt = randomHex(16);
    return { pinHash: await hashPin(pin, salt, id, dept), pinSalt: salt, pinAlgo: ALGO };
  }
  var TRIVIAL = { '0000': 1, '1111': 1, '1234': 1, '2026': 1, '4321': 1, '123456': 1, '000000': 1, '111111': 1, '654321': 1, '123123': 1, '121212': 1 };
  function isTrivial(pin) {
    pin = String(pin);
    if (TRIVIAL[pin]) return true;
    if (/^(\d)\1+$/.test(pin)) return true;
    var asc = true, desc = true;
    for (var i = 1; i < pin.length; i++) {
      var d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
      if (d !== 1) asc = false; if (d !== -1) desc = false;
    }
    return asc || desc;
  }
  function minLenForRole(role, isAdmin) { return (isAdmin || STRONG_ROLE_RE.test(String(role || ''))) ? 6 : 4; }
  function validatePin(rawPin, role, isAdmin) {
    var pin = normalizePin(rawPin);
    if (!/^\d+$/.test(pin)) return { ok: false, msg: 'PIN must contain digits only.' };
    var min = minLenForRole(role, isAdmin);
    if (pin.length < min) return { ok: false, msg: 'PIN must be at least ' + min + ' digits for this role.' };
    if (pin.length > 12) return { ok: false, msg: 'PIN must be 12 digits or fewer.' };
    if (isTrivial(pin)) return { ok: false, msg: 'This PIN is too easy to guess. Choose a different one.' };
    return { ok: true, pin: pin };
  }
  function generatePin(len) {
    len = len || 6;
    for (var n = 0; n < 50; n++) {
      var a = new Uint32Array(len); g.crypto.getRandomValues(a);
      var s = Array.prototype.map.call(a, function (x) { return String(x % 10); }).join('');
      if (!isTrivial(s)) return s;
    }
    return '739204'.slice(0, len);
  }
  /* a record is "weak" when it was migrated from the legacy table or cannot be re-checked as 6+ digits */
  function isWeakMember(m) { return !!(m && (m.weakPin || m.mustReset)); }

  g.AccessCrypto = { ALGO: ALGO, ITER: ITER, available: available, randomHex: randomHex, normalizePin: normalizePin,
    hashPin: hashPin, verifyPin: verifyPin, makePinRecord: makePinRecord, validatePin: validatePin,
    generatePin: generatePin, isTrivial: isTrivial, minLenForRole: minLenForRole, isWeakMember: isWeakMember };
})(typeof window !== 'undefined' ? window : globalThis);
