/* ADMIN-HOLIDAY-MERGE.JS - 3-way merge of plant holidays (UMD: browser + Node).
   base   = holidays as last read from the server by this admin session
   mine   = holidays on screen now (base + this admin's edits)
   theirs = holidays freshly read from the server right before saving
   Result = theirs + ONLY what this session added/removed. Dates other people added stay. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RppfHolidayMerge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const arr = x => Array.isArray(x) ? x.slice() : [];
  function listMerge(base, mine, theirs) {
    base = arr(base); mine = arr(mine);
    const added = mine.filter(x => base.indexOf(x) < 0), removed = base.filter(x => mine.indexOf(x) < 0);
    const out = arr(theirs).filter(x => removed.indexOf(x) < 0);
    added.forEach(x => { if (out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  function merge(base, mine, theirs) {
    base = base || {}; mine = mine || {}; theirs = theirs || {};
    const out = JSON.parse(JSON.stringify(theirs));
    out.custom = listMerge(base.custom, mine.custom, theirs.custom);
    out.cancelled = listMerge(base.cancelled, mine.cancelled, theirs.cancelled);
    const bm = base.byMonth || {}, mm = mine.byMonth || {}, tm = Object.assign({}, theirs.byMonth || {});
    Object.keys(Object.assign({}, bm, mm)).forEach(k => {
      if (JSON.stringify(bm[k]) !== JSON.stringify(mm[k])) { if (k in mm) tm[k] = mm[k]; else delete tm[k]; }
    });
    out.byMonth = tm;
    return out;
  }
  return { merge: merge, listMerge: listMerge };
});
