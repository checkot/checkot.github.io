#!/usr/bin/env python3
"""
build_emp_history.py - Builds compact per-employee multi-month history JSON files
under data/emp/<DEPT>/<ID>.json from existing data/*.json and data/qa/*.json.

Each file contains:
- Employee metadata (id, dept, name, grade, area, sub, latestMonth, updatedAt)
- datasetMeta per month ({ maxActiveDay, consensusHolidays }) so attendance/absent
  logic produces 100% identical results to loading the full 6 MB monthly JSON.
- months: { "YYYY-MM": <employee record in the exact same shape as employees[]>, ... }
  enriched with { month, updatedAt, _prevMonthLastNight, _sectionStats }.
"""

import os
import re
import json
import pathlib
import datetime

ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
EMP_OUT_DIR = DATA_DIR / "emp"
AREAS_FILE = ROOT_DIR / "areas.json"

MONTH_REGEX = re.compile(r"^\d{4}-\d{2}\.json$")
ID_ALIASES = {
    "CL6515": "556515",
    "556515": "CL6515",
    "CL6531": "556531",
    "556531": "CL6531",
}


def parse_day_no(d_val):
    if isinstance(d_val, (int, float)):
        return int(d_val)
    s = str(d_val or "").strip()
    m_iso = re.match(r"^\d{4}-\d{1,2}-(\d{1,2})$", s)
    if m_iso:
        return int(m_iso.group(1))
    m_num = re.match(r"^(\d{1,2})", s)
    return int(m_num.group(1)) if m_num else 0


def compute_dataset_meta(employees):
    max_active_day = 0
    day_stats = {}
    for e in employees:
        if not e or e.get("isRppf") is False:
            continue
        daily = e.get("daily") or []
        for r in daily:
            if not r or not isinstance(r, list):
                continue
            k = parse_day_no(r[0])
            if k < 1 or k > 31:
                continue
            st = day_stats.setdefault(k, {"total": 0, "reg": 0, "hol": 0, "active": 0})
            st["total"] += 1
            reg_d = float(r[4] or 0)
            do_d = float(r[6] or 0) + float(r[7] or 0)
            hol_d = float(r[8] or 0) + float(r[9] or 0)
            d_hrs = reg_d + float(r[5] or 0) + do_d + hol_d
            in_str = str(r[2] or "").strip()
            out_str = str(r[3] or "").strip()
            is_night = bool(r[10])
            if reg_d > 0:
                st["reg"] += 1
            if hol_d > 0 or do_d > 0:
                st["hol"] += 1
            if d_hrs > 0 or in_str or out_str or is_night:
                st["active"] += 1
                if k > max_active_day:
                    max_active_day = k

    consensus_holidays = sorted(
        k
        for k, st in day_stats.items()
        if st["total"] >= 15 and (st["hol"] / st["total"] >= 0.25 or (st["reg"] / st["total"] < 0.25 and st["hol"] > 0))
    )
    return {
        "maxActiveDay": max_active_day if max_active_day > 0 else 31,
        "consensusHolidays": consensus_holidays,
    }


def did_work_last_night(emp, ym_str):
    if not emp:
        return False
    m = re.match(r"^(\d{4})-(\d{2})$", str(ym_str or ""))
    if not m:
        return False
    y, mo = int(m.group(1)), int(m.group(2))
    if mo == 12:
        last_cal_day = 31
    else:
        last_cal_day = (datetime.date(y, mo + 1, 1) - datetime.timedelta(days=1)).day

    for r in emp.get("daily") or []:
        if not r or not isinstance(r, list):
            continue
        k = parse_day_no(r[0])
        sh = str(r[11] if len(r) > 11 else "").upper()
        if k == last_cal_day and (bool(r[10]) or "NIGHT" in sh or sh == "DN"):
            return True

    for nd in emp.get("nightDays") or []:
        d_str = nd if isinstance(nd, str) else (nd.get("date") if isinstance(nd, dict) else "")
        if parse_day_no(d_str) == last_cal_day:
            return True
    return False


def compute_section_stats_for_month(employees, area_map, dept="PR"):
    """
    Computes anonymous section averages and per-employee rank positions within their area.
    """
    by_area = {}
    for e in employees:
        if not e or e.get("isRppf") is False:
            continue
        eid = str(e.get("id") or "").upper().strip()
        if not eid:
            continue
        mapped_area = area_map.get(eid) or area_map.get(ID_ALIASES.get(eid, ""))
        area = mapped_area or e.get("area") or ("Quality Assurance" if dept == "QA" else "Packing Hall")
        if area in ("Other facility", "Not on the list"):
            continue
        by_area.setdefault(area, []).append(e)

    stats_by_emp_id = {}
    for area, group in by_area.items():
        n = len(group)
        if n == 0:
            continue
        avg_ot = round(sum(float(x.get("otHours") or 0) for x in group) / n, 1)
        avg_duty = round(sum(float(x.get("totalDuty") or 0) for x in group) / n, 1)

        by_ot = sorted(group, key=lambda x: (-float(x.get("otHours") or 0), -float(x.get("totalDuty") or 0), str(x.get("id"))))
        by_duty = sorted(group, key=lambda x: (-float(x.get("totalDuty") or 0), -float(x.get("otHours") or 0), str(x.get("id"))))
        by_earned = sorted(group, key=lambda x: (-float(x.get("totalEarned") or 0), -float(x.get("otHours") or 0), str(x.get("id"))))

        ot_rank_map = {str(x.get("id")).upper(): idx + 1 for idx, x in enumerate(by_ot)}
        duty_rank_map = {str(x.get("id")).upper(): idx + 1 for idx, x in enumerate(by_duty)}
        earned_rank_map = {str(x.get("id")).upper(): idx + 1 for idx, x in enumerate(by_earned)}

        for x in group:
            uid = str(x.get("id")).upper()
            stats_by_emp_id[uid] = {
                "area": area,
                "headcount": n,
                "avgOt": avg_ot,
                "avgDuty": avg_duty,
                "otRank": ot_rank_map.get(uid),
                "dutyRank": duty_rank_map.get(uid),
                "earnedRank": earned_rank_map.get(uid),
            }
    return stats_by_emp_id


def build_department_history(dept, data_subdir, area_map, details_map):
    if not data_subdir.exists():
        return 0, 0
    month_files = sorted(f for f in data_subdir.iterdir() if f.is_file() and MONTH_REGEX.match(f.name))
    if not month_files:
        return 0, 0

    emp_history = {}
    dataset_meta_by_month = {}
    last_night_by_month = {}

    for mf in month_files:
        ym = mf.stem
        try:
            payload = json.loads(mf.read_text(encoding="utf-8"))
        except Exception as err:
            print(f"[WARN] Failed to read {mf}: {err}")
            continue

        updated_at = payload.get("updatedAt") or ""
        employees = payload.get("employees") if isinstance(payload, dict) else (payload if isinstance(payload, list) else [])
        if not employees:
            continue

        ds_meta = compute_dataset_meta(employees)
        dataset_meta_by_month[ym] = ds_meta
        sec_stats_map = compute_section_stats_for_month(employees, area_map, dept=dept)

        # Compute previous calendar month string
        y, m = map(int, ym.split("-"))
        py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
        prev_ym = f"{py:04d}-{pm:02d}"
        prev_night_set = last_night_by_month.get(prev_ym, set())

        cur_night_set = set()
        for e in employees:
            if not e or not e.get("id"):
                continue
            eid = str(e["id"]).upper().strip()
            alias_id = ID_ALIASES.get(eid, eid)
            if did_work_last_night(e, ym):
                cur_night_set.add(eid)
                cur_night_set.add(alias_id)

            mapped_area = area_map.get(eid) or area_map.get(alias_id)
            sub_val = (details_map.get(eid) or details_map.get(alias_id) or {}).get("s") or e.get("sub") or ""
            rec = dict(e)
            rec["id"] = eid
            rec["dept"] = dept
            if mapped_area:
                rec["area"] = mapped_area
            if sub_val:
                rec["sub"] = sub_val
            rec["month"] = ym
            rec["updatedAt"] = updated_at
            rec["_prevMonthLastNight"] = (eid in prev_night_set) or (alias_id in prev_night_set)
            if eid in sec_stats_map:
                rec["_sectionStats"] = sec_stats_map[eid]

            hist = emp_history.setdefault(
                eid,
                {
                    "id": eid,
                    "dept": dept,
                    "name": rec.get("name") or eid,
                    "grade": rec.get("grade") or "",
                    "kind": rec.get("kind") or "",
                    "category": rec.get("category"),
                    "area": rec.get("area") or "",
                    "sub": sub_val,
                    "latestMonth": ym,
                    "updatedAt": updated_at,
                    "datasetMeta": {},
                    "months": {},
                },
            )
            hist["name"] = rec.get("name") or hist["name"]
            hist["grade"] = rec.get("grade") or hist["grade"]
            hist["kind"] = rec.get("kind") or hist["kind"]
            hist["category"] = rec.get("category") or hist["category"]
            hist["area"] = rec.get("area") or hist["area"]
            hist["sub"] = sub_val or hist["sub"]
            hist["latestMonth"] = ym
            hist["updatedAt"] = updated_at
            hist["months"][ym] = rec

        last_night_by_month[ym] = cur_night_set

    out_dir = EMP_OUT_DIR / dept
    out_dir.mkdir(parents=True, exist_ok=True)

    total_bytes = 0
    count = 0
    for eid, hist in emp_history.items():
        # Include datasetMeta for all months in this department so attendance calculations know maxActiveDay & consensusHolidays
        hist["datasetMeta"] = dataset_meta_by_month
        fpath = out_dir / f"{eid}.json"
        raw_json = json.dumps(hist, ensure_ascii=False, separators=(",", ":"))
        fpath.write_text(raw_json, encoding="utf-8")
        total_bytes += len(raw_json.encode("utf-8"))
        count += 1

        # If this ID has a known alias (e.g. 556515 <-> CL6515), also write the alias file if not separately present
        alias_id = ID_ALIASES.get(eid)
        if alias_id and alias_id not in emp_history:
            alias_hist = dict(hist)
            alias_hist["id"] = alias_id
            alias_path = out_dir / f"{alias_id}.json"
            alias_json = json.dumps(alias_hist, ensure_ascii=False, separators=(",", ":"))
            alias_path.write_text(alias_json, encoding="utf-8")

    return count, total_bytes


def build_all_emp_histories():
    area_map = {}
    details_map = {}
    if AREAS_FILE.exists():
        try:
            adata = json.loads(AREAS_FILE.read_text(encoding="utf-8"))
            area_map = {str(k).upper(): v for k, v in (adata.get("areas") or {}).items()}
            details_map = {str(k).upper(): v for k, v in (adata.get("details") or {}).items()}
        except Exception as err:
            print(f"[WARN] Could not parse areas.json: {err}")

    pr_count, pr_bytes = build_department_history("PR", DATA_DIR, area_map, details_map)
    qa_count, qa_bytes = build_department_history("QA", DATA_DIR / "qa", area_map, details_map)

    avg_pr_kb = (pr_bytes / pr_count / 1024) if pr_count else 0
    avg_qa_kb = (qa_bytes / qa_count / 1024) if qa_count else 0
    print(f"[SUCCESS] Built PR employee histories: {pr_count} files ({pr_bytes / (1024*1024):.2f} MB total, avg {avg_pr_kb:.1f} KB/emp)")
    print(f"[SUCCESS] Built QA employee histories: {qa_count} files ({qa_bytes / 1024:.1f} KB total, avg {avg_qa_kb:.1f} KB/emp)")
    return pr_count + qa_count


if __name__ == "__main__":
    build_all_emp_histories()
