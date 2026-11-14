#!/usr/bin/env python3
"""
Build per-employee history files for the "Me" (Employee Profile) page.

  data/YYYY-MM.json      (PR)   ┐
  data/qa/YYYY-MM.json   (QA)   ┴─►  data/emp/<DEPT>/<ID>.json   (~50-80 KB each)

Each file holds that employee's records for every month in the SAME object shape as
`employees[]` of the month files (so the existing JS keeps working unchanged), plus
pre-computed month-level context that a single employee file cannot derive on its own:

  {
    "v": 1, "dept": "PR", "id": "556490", "updatedAt": "<latest month updatedAt>",
    "monthUpdatedAt": {"2026-11": "..."},
    "months": { "2026-11": { ...employee object... }, ... },
    "meta":   { "2026-11": { "maxActiveDay": 13, "consensusHolidays": [4,5],
                              "prevNight": false } }
  }

meta[ym] mirrors js/app-main.js:
  - getMonthDatasetMeta(ym)      -> maxActiveDay / consensusHolidays (whole-month consensus)
  - hasPrevMonthLastNight(id,ym) -> prevNight (worked night on the last calendar day of ym-1)
Keep these algorithms in sync with app-main.js.

Usage:
  python3 scripts/build_emp_history.py                # all departments
  python3 scripts/build_emp_history.py --dept QA
Only files whose content changed are rewritten (so git diffs stay small).
"""
import argparse
import calendar
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MONTH_RE = re.compile(r"^(\d{4})-(\d{2})\.json$")
DROP_KEYS = {"fileName"}  # not needed client-side


def _day_no(v):
    """_parseEmpDayNo: 'DD-MON-YYYY' / 'YYYY-MM-DD' / int -> day-of-month."""
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v if v is not None else "").strip()
    m = re.match(r"^\d{4}-\d{1,2}-(\d{1,2})$", s)
    if m:
        return int(m.group(1))
    m = re.match(r"^\s*([+-]?\d+)", s)
    return int(m.group(1)) if m else 0


def _num(v):
    try:
        x = float(v)
        return x if x == x else 0.0
    except (TypeError, ValueError):
        return 0.0


def _is_night_row(r):
    sc = str(r[11] if len(r) > 11 and r[11] is not None else "").upper()
    return bool(r[10] if len(r) > 10 else 0) or "NIGHT" in sc or sc == "DN"


def dataset_meta(employees):
    """Port of getMonthDatasetMeta() (daily-rows branch)."""
    max_active = 0
    stats = {}
    for e in employees:
        if not e or e.get("isRppf") is False:
            continue
        for r in (e.get("daily") or []):
            if not r:
                continue
            k = _day_no(r[0])
            if not k or k < 1 or k > 31:
                continue
            st = stats.setdefault(k, {"total": 0, "reg": 0, "hol": 0, "active": 0})
            st["total"] += 1
            r = list(r) + [0] * (12 - len(r))
            reg_d = _num(r[4])
            do_d = _num(r[6]) + _num(r[7])
            hol_d = _num(r[8]) + _num(r[9])
            d_hrs = reg_d + _num(r[5]) + do_d + hol_d
            in_s = str(r[2] or "").strip()
            out_s = str(r[3] or "").strip()
            if reg_d > 0:
                st["reg"] += 1
            if hol_d > 0 or do_d > 0:
                st["hol"] += 1
            if d_hrs > 0 or in_s or out_s or bool(r[10]):
                st["active"] += 1
                if k > max_active:
                    max_active = k
    cons = []
    for k, st in stats.items():
        if st["total"] >= 15:
            if st["hol"] / st["total"] >= 0.25 or (st["reg"] / st["total"] < 0.25 and st["hol"] > 0):
                cons.append(k)
    return {"maxActiveDay": max_active if max_active > 0 else 31, "consensusHolidays": sorted(cons)}


def worked_night_last_day(e, ym):
    """Port of didEmpWorkNightOnLastDay()."""
    m = re.match(r"^(\d{4})-(\d{2})$", ym)
    last = calendar.monthrange(int(m.group(1)), int(m.group(2)))[1]
    for r in (e.get("daily") or []):
        if r and _day_no(r[0]) == last:
            r = list(r) + [0] * (12 - len(r))
            if _is_night_row(r):
                return True
    for nd in (e.get("nightDays") or []):
        if _day_no(nd if isinstance(nd, str) else (nd or {}).get("date")) == last:
            return True
    return False


def prev_month(ym):
    y, m = int(ym[:4]), int(ym[5:7]) - 1
    if m < 1:
        y, m = y - 1, 12
    return "%04d-%02d" % (y, m)


def safe_id(raw):
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(raw or "").strip().upper())


def load_months(folder):
    out = {}
    if not folder.exists():
        return out
    for f in sorted(folder.iterdir()):
        m = MONTH_RE.match(f.name)
        if m:
            with open(f, encoding="utf-8") as fh:
                out[f.name[:7]] = json.load(fh)
    return out


def build_dept(dept, data_dir, out_root, verbose=True):
    folder = data_dir if dept == "PR" else data_dir / "qa"
    months = load_months(folder)
    out_dir = out_root / dept
    if not months:
        if verbose:
            print(f"[emp-history] {dept}: no month files in {folder}")
        return 0, 0
    meta = {ym: dataset_meta(j.get("employees") or []) for ym, j in months.items()}
    night_last = {}  # ym -> set(ids) who worked night on last day of that month
    for ym, j in months.items():
        night_last[ym] = {str(e.get("id", "")).strip().upper() for e in (j.get("employees") or []) if e and worked_night_last_day(e, ym)}
    per = {}
    for ym in sorted(months):
        j = months[ym]
        for e in (j.get("employees") or []):
            if not e:
                continue
            uid = str(e.get("id", "")).strip().upper()
            if not uid:
                continue
            rec = per.setdefault(uid, {"months": {}, "meta": {}, "mu": {}})
            rec["months"][ym] = {k: v for k, v in e.items() if k not in DROP_KEYS}
            mm = dict(meta[ym])
            mm["prevNight"] = uid in night_last.get(prev_month(ym), set())
            rec["meta"][ym] = mm
            rec["mu"][ym] = j.get("updatedAt", "")
    out_dir.mkdir(parents=True, exist_ok=True)
    written = unchanged = 0
    keep = set()
    for uid, rec in per.items():
        fname = safe_id(uid) + ".json"
        keep.add(fname)
        payload = {
            "v": 1, "dept": dept, "id": uid,
            "updatedAt": max(rec["mu"].values()) if rec["mu"] else "",
            "monthUpdatedAt": rec["mu"],
            "months": rec["months"], "meta": rec["meta"],
        }
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        p = out_dir / fname
        if p.exists() and p.read_text(encoding="utf-8") == text:
            unchanged += 1
            continue
        p.write_text(text, encoding="utf-8")
        written += 1
    removed = 0
    for p in out_dir.glob("*.json"):  # employee no longer in any month file
        if p.name not in keep:
            p.unlink()
            removed += 1
    if verbose:
        print(f"[emp-history] {dept}: {len(per)} employees, written {written}, unchanged {unchanged}, removed {removed}")
    return written, removed


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "data"))
    ap.add_argument("--out", default=None, help="default: <data>/emp")
    ap.add_argument("--dept", default="all", choices=["all", "PR", "QA"])
    a = ap.parse_args(argv)
    data_dir = Path(a.data)
    out_root = Path(a.out) if a.out else data_dir / "emp"
    for d in (["PR", "QA"] if a.dept == "all" else [a.dept]):
        build_dept(d, data_dir, out_root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
