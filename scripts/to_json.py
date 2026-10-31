

#!/usr/bin/env python3
"""
to_json.py - Converts Empress HRIS Monthly Work Log Excel exports into
production-ready pre-indexed JSON for RPPF Admin Control Panel.

Matches the exact parsing algorithms from RPPF_Dedicated_Admin_Control_Panel_v7-6.html:
- Column heuristic detection (detectWorkLogColumns)
- Summary sheet mapping (buildSummaryMap)
- Punch problem & missing time validation (cleanPunchValue & isPunchMissing)
- Regular/Holiday/DO/Night shift calculation
- Category & grade detection (detectCategory)
- Rate package computation (otAmount, holidayAmount, nightAmount, totalEarned)
- Multi-account employee deduplication & merging (pickBestEmployee)
- Automatic month detection (YYYY-MM)
- Generates data/{YYYY-MM}.json and data/latest.json
"""

import os
import sys
import re
import json
import pathlib
import datetime
from collections import Counter
import openpyxl

RAW_DIR = pathlib.Path("raw")
DATA_DIR = pathlib.Path("data")

MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

RPPF_FACILITY_REGEX = re.compile(r'RAJENDRAPUR\s*POTENT\s*PRODUCT\s*FACILITY', re.IGNORECASE)

DEFAULT_RATE_TABLE = {
    "CF": {
        "otRate": 38,
        "nightRate": 300,
        "holidayType": "hourly",
        "holidayHours": 8,
        "holidayFlat": 304,
        "name": "৳38/hour package (Contractual / CF)"
    },
    "JO": {
        "otRate": 40,
        "nightRate": 400,
        "holidayType": "flat",
        "holidayHours": 8,
        "holidayFlat": 300,
        "name": "৳40/hour package (JO C–F)"
    },
    "JO_B": {
        "otRate": 45,
        "nightRate": 500,
        "holidayType": "flat",
        "holidayHours": 8,
        "holidayFlat": 350,
        "name": "৳45/hour package (JO A/B)"
    },
    "UNSPEC": {
        "otRate": 0,
        "nightRate": 0,
        "holidayType": "flat",
        "holidayHours": 0,
        "holidayFlat": 0,
        "noRate": True,
        "name": "Unspecified (no rate / hours only)"
    }
}

def load_areas_json():
    """Attempts to load areas.json from current directory or parent directory."""
    for p in [pathlib.Path("areas.json"), pathlib.Path("../areas.json")]:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return (
                        data.get("areas", {}),
                        data.get("details", {}),
                        data.get("rateTable", DEFAULT_RATE_TABLE)
                    )
            except Exception as e:
                print(f"[WARN] Could not parse {p}: {e}")
    return {}, {}, DEFAULT_RATE_TABLE

def clean_punch_value(val):
    if val is None:
        return ""
    s = str(val)
    return re.sub(r'[\s\u00A0\u1680\u2000-\u200F\u2028-\u202F\u205F\u3000\uFEFF]+', '', s).strip()

def is_punch_missing(val):
    cleaned = clean_punch_value(val).upper()
    if not cleaned:
        return True
    if cleaned in ("-", "--", "N/A", "NA", "NULL", "NONE", "MISSING"):
        return True
    if re.match(r'^0{1,2}:00(:00)?$', cleaned):
        return True
    if not re.match(r'^\d{1,2}:\d{2}(:\d{2})?([AP]M)?$', cleaned, re.IGNORECASE):
        return True
    return False

def clean_emp_name(raw):
    if raw is None:
        return ""
    n = re.sub(r'[\u00A0\u200B-\u200D\uFEFF]', ' ', str(raw))
    n = re.sub(r'\s+', ' ', n).strip()
    while True:
        prev = n
        n = re.sub(r'^(Mr|Mrs|Ms|Miss)\.?\s+', '', n, flags=re.IGNORECASE)
        if n == prev:
            break
    return n.strip()

def clean_designation(raw):
    if raw is None:
        return ""
    n = re.sub(r'[\u00A0\u200B-\u200D\uFEFF]', ' ', str(raw))
    return re.sub(r'\s+', ' ', n).strip()

def parse_emp_header(col0, emp_id):
    rest = col0[len(emp_id):]
    rest = re.sub(r'[\u00A0\u200B-\u200D\uFEFF]', ' ', rest).strip()
    parts = [x.strip() for x in rest.split(',')]
    name_desig = rest
    if len(parts) >= 3:
        name_desig = ', '.join(parts[:-2])  # Drop Department, Location
    m = re.match(r'^(.*?)\s{2,}(.+)$', name_desig)
    if m:
        return clean_emp_name(m.group(1)), clean_designation(m.group(2))
    g = re.match(r'^(.*?)\s+((?:Junior\s+Officer\s+[A-F]|Helper|Casual)\b.*)$', name_desig, re.IGNORECASE)
    if g:
        return clean_emp_name(g.group(1)), clean_designation(g.group(2))
    return clean_emp_name(name_desig), ""

def detect_category(grade_text, emp_id):
    g = (grade_text or "").upper().strip()
    id_upper = (emp_id or "").upper().strip()
    if id_upper.startswith("CF") or re.search(r'\bHELPER\b', g):
        return {"category": "CF", "valid": True, "reason": "Contractual", "gradeText": g or "CF"}
    if re.search(r'\b(EXECUTIVE|SENIOR\s+OFFICER|ASSISTANT\s+MANAGER|MANAGER|DEPUTY|DIRECTOR|HEAD)\b', g) and not re.search(r'JUNIOR\s+OFFICER', g):
        return {"category": None, "valid": False, "reason": "Management/Executive", "gradeText": g}
    grade_match = re.search(r'JUNIOR\s+OFFICER\s+([A-F])\b', g)
    level_match = re.search(r'\bM(\d{2})\b', g)
    grade_letter = grade_match.group(1).upper() if grade_match else None
    level_num = int(level_match.group(1)) if level_match else None
    if grade_letter:
        if grade_letter in ("A", "B"):
            return {"category": "JO_B", "valid": True, "reason": f"Grade {grade_letter}", "gradeText": g}
        if grade_letter in ("C", "D", "E", "F"):
            return {"category": "JO", "valid": True, "reason": f"Grade {grade_letter}", "gradeText": g}
    if level_num is not None:
        if level_num in (16, 17):
            return {"category": "JO_B", "valid": True, "reason": f"M{level_num}", "gradeText": g}
        if 18 <= level_num <= 20:
            return {"category": "JO", "valid": True, "reason": f"M{level_num}", "gradeText": g}
        return {"category": None, "valid": False, "reason": f"M{level_num} - out of scope", "gradeText": g}
    if g and re.match(r'^(OFFICER|UN-?SKILLED|SKILLED|SEMI)', g):
        return {"category": None, "valid": False, "reason": f"Out of grade ({g})", "gradeText": g}
    if id_upper.startswith("RF") or id_upper.startswith("CL"):
        return {"category": "JO", "valid": True, "reason": "Junior Officer (Assumed)", "gradeText": g}
    return {"category": None, "valid": False, "reason": "Grade could not be detected", "gradeText": g or "—"}

def is_rppf_text(text):
    if not text:
        return False
    return bool(RPPF_FACILITY_REGEX.search(str(text).upper()) or "RAJENDRAPUR" in str(text).upper())

def build_summary_map(workbook):
    summary_map = {}
    if "Summary" not in workbook.sheetnames:
        return summary_map
    ws = workbook["Summary"]
    rows = list(ws.iter_rows(values_only=True))
    header_idx = -1
    ci = {}
    for i in range(min(len(rows), 15)):
        r = rows[i]
        low = [str(c or "").strip().lower() for c in r]
        if "employee id" in low:
            header_idx = i
            ci = {
                "id": low.index("employee id"),
                "name": low.index("employee name") if "employee name" in low else -1,
                "desig": low.index("designation") if "designation" in low else -1
            }
            break
    if header_idx < 0:
        return summary_map
    for r in rows[header_idx + 1:]:
        if not r or ci["id"] >= len(r) or r[ci["id"]] is None:
            continue
        emp_id = re.sub(r'\s+', '', str(r[ci["id"]])).upper()
        if not emp_id:
            continue
        name_val = str(r[ci["name"]]) if ci["name"] >= 0 and ci["name"] < len(r) and r[ci["name"]] else ""
        desig_val = str(r[ci["desig"]]) if ci["desig"] >= 0 and ci["desig"] < len(r) and r[ci["desig"]] else ""
        summary_map[emp_id] = {
            "name": clean_emp_name(name_val),
            "designation": clean_designation(desig_val)
        }
    return summary_map

def detect_work_log_columns(rows):
    ci = {
        "date": 0, "day": 1, "shift": -1, "in": 2, "out": 3,
        "regDuty": 4, "regOT": 5, "doDuty": 6, "doOT": 7,
        "holDuty": 8, "holOT": 9, "night": 10
    }
    for i in range(min(len(rows), 25)):
        r = rows[i]
        if not r:
            continue
        low = [str(c or "").strip().lower() for c in r]
        if "date" not in low:
            continue
        has_clues = any(c in ("in", "out", "day") or "duty" in c for c in low)
        if not has_clues:
            continue
        for idx, val in enumerate(low):
            if not val:
                continue
            if val == "date":
                ci["date"] = idx
            elif val == "day":
                ci["day"] = idx
            elif "shift" in val:
                ci["shift"] = idx
            elif val == "in" or val.startswith("in ") or val.startswith("in("):
                ci["in"] = idx
            elif val == "out" or val.startswith("out ") or val.startswith("out("):
                ci["out"] = idx
            elif any(w in val for w in ("day off", "day-off", "off day")):
                if "duty" in val:
                    ci["doDuty"] = idx
                elif "ot" in val or "overtime" in val:
                    ci["doOT"] = idx
            elif "holiday" in val:
                if "duty" in val:
                    ci["holDuty"] = idx
                elif "ot" in val or "overtime" in val:
                    ci["holOT"] = idx
            elif "night" in val:
                ci["night"] = idx
            elif "duty" in val:
                ci["regDuty"] = idx
            elif "ot" in val or "overtime" in val:
                ci["regOT"] = idx
        return ci
    return ci

def format_date_str(val):
    if isinstance(val, (datetime.date, datetime.datetime)):
        return val.strftime("%d-%b-%Y").upper()
    s = str(val or "").strip()
    m = re.match(r'^(\d{2})-([A-Za-z]{3})-(\d{4})$', s)
    if m:
        return f"{m.group(1)}-{m.group(2).upper()}-{m.group(3)}"
    return s

def extract_ym_from_date(date_str):
    m = re.match(r'^\d{2}-([A-Za-z]{3})-(\d{4})$', date_str)
    if m:
        mon_str = m.group(1).upper()
        if mon_str in MONTH_NAMES:
            mon_num = MONTH_NAMES.index(mon_str) + 1
            return f"{m.group(2)}-{mon_num:02d}"
    return None

def finalize_excel_employee(c, source_name, area_map, rate_table, details=None):
    detection = detect_category(c["designation"], c["id"])
    valid = bool(detection["valid"] and detection["category"])
    category = detection["category"] if valid else None
    
    cid = str(c["id"])
    if re.match(r'^\d{5,8}$', cid) or re.search(r'^CASUAL', c["designation"] or "", re.IGNORECASE):
        kind = "CAS"
    elif not valid and cid.upper().startswith("RF"):
        kind = "EXEC"
    else:
        kind = ""

    r = rate_table.get(category) or rate_table.get("JO") or DEFAULT_RATE_TABLE["JO"]
    
    ot_hours = round(c["totalRow"]["ot"] if c["totalRow"] else c["dailyOt"], 2)
    total_duty = round(c["totalRow"]["duty"] if c["totalRow"] else c["dailyDuty"], 2)
    holiday_count = len(c["holidayDays"])
    night_count = len(c["nightDays"])
    
    if valid and not r.get("noRate", False):
        ot_amount = round(ot_hours * r["otRate"], 2)
        if r.get("holidayType") == "hourly":
            holiday_amount = round(holiday_count * r.get("holidayHours", 8) * r["otRate"], 2)
        else:
            holiday_amount = round(holiday_count * r.get("holidayFlat", 300), 2)
        night_amount = round(night_count * r["nightRate"], 2)
    else:
        ot_amount = 0.0
        holiday_amount = 0.0
        night_amount = 0.0

    total_earned = round(ot_amount + holiday_amount + night_amount, 2)
    area = area_map.get(c["id"], "Packing Hall" if c["isRppf"] else "Other facility")

    return {
        "valid": valid,
        "id": c["id"],
        "name": c["name"][:45],
        "grade": c["designation"],
        "kind": kind,
        "category": category,
        "area": area,
        "sub": (details.get(c["id"], {}).get("s", "") if details else ""),
        "isRppf": c["isRppf"],
        "totalDuty": total_duty,
        "otHours": ot_hours,
        "holidayCount": holiday_count,
        "nightCount": night_count,
        "regularDaysCount": c["regularDaysCount"],
        "plainDaysCount": c["plainDaysCount"],
        "holidayDays": c["holidayDays"],
        "nightDays": c["nightDays"],
        "punchProblems": c["punchProblems"],
        "daily": c["daily"],
        "otAmount": ot_amount,
        "holidayAmount": holiday_amount,
        "nightAmount": night_amount,
        "totalEarned": total_earned,
        "fileName": source_name or ""
    }

def get_punch_problem_count(emp):
    if not emp:
        return 0
    probs = emp.get("punchProblems")
    if isinstance(probs, list):
        return len(probs)
    return int(probs or 0)

def pick_best_employee(a, b):
    a_punch = get_punch_problem_count(a)
    b_punch = get_punch_problem_count(b)
    if a_punch != b_punch:
        return a if a_punch < b_punch else b
    if a.get("totalDuty", 0) != b.get("totalDuty", 0):
        return a if a.get("totalDuty", 0) > b.get("totalDuty", 0) else b
    if a.get("otHours", 0) != b.get("otHours", 0):
        return a if a.get("otHours", 0) > b.get("otHours", 0) else b
    if a.get("nightCount", 0) != b.get("nightCount", 0):
        return a if a.get("nightCount", 0) > b.get("nightCount", 0) else b
    if a.get("holidayCount", 0) != b.get("holidayCount", 0):
        return a if a.get("holidayCount", 0) > b.get("holidayCount", 0) else b
    return a

def parse_workbook(wb, source_name, area_map, rate_table, details=None):
    sheet_name = "Work Log" if "Work Log" in wb.sheetnames else wb.sheetnames[0]
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    summary_map = build_summary_map(wb)
    ci = detect_work_log_columns(rows)
    
    out = []
    month_counts = Counter()
    cur = None

    def flush():
        nonlocal cur
        if cur:
            out.append(finalize_excel_employee(cur, source_name, area_map, rate_table, details=details))
            cur = None

    def get_num(row, col_idx):
        if 0 <= col_idx < len(row) and row[col_idx] is not None:
            try:
                return float(row[col_idx])
            except (ValueError, TypeError):
                return 0.0
        return 0.0

    def get_val(row, col_idx):
        if 0 <= col_idx < len(row) and row[col_idx] is not None:
            return clean_punch_value(row[col_idx])
        return ""

    for row in rows:
        if not row:
            continue
        raw_col0 = row[0]
        if raw_col0 is None:
            continue
        
        formatted_date = format_date_str(raw_col0)
        is_date_row = bool(re.match(r'^\d{2}-[A-Za-z]{3}-\d{4}$', formatted_date))
        
        col0_clean = re.sub(r'[\u00A0\u200B-\u200D\uFEFF]', ' ', str(raw_col0)).strip()
        
        id_match = re.match(r'^([A-Z]{2}\d{3,6}|\d{5,8})\s+', col0_clean, re.IGNORECASE)
        if id_match and not is_date_row:
            flush()
            emp_id = id_match.group(1).upper()
            hdr_name, hdr_desig = parse_emp_header(col0_clean, emp_id)
            sm = summary_map.get(emp_id, {})
            name = sm.get("name") or hdr_name
            designation = sm.get("designation") or hdr_desig
            cur = {
                "id": emp_id,
                "name": name,
                "designation": designation,
                "isRppf": is_rppf_text(col0_clean),
                "totalRow": None,
                "dailyDuty": 0.0,
                "dailyOt": 0.0,
                "regularDaysCount": 0,
                "plainDaysCount": 0,
                "holidayDays": [],
                "nightDays": [],
                "punchProblems": [],
                "daily": []
            }
            continue

        if not cur:
            continue

        if re.match(r'^total$', col0_clean, re.IGNORECASE):
            regDuty = get_num(row, ci["regDuty"])
            regOT = get_num(row, ci["regOT"])
            doDuty = get_num(row, ci["doDuty"])
            doOT = get_num(row, ci["doOT"])
            holDuty = get_num(row, ci["holDuty"])
            holOT = get_num(row, ci["holOT"])
            cur["totalRow"] = {
                "duty": round(regDuty + regOT + doDuty + doOT + holDuty + holOT, 2),
                "ot": round(regOT + doOT + holOT, 2)
            }
            continue

        if is_date_row:
            date_str = formatted_date
            ym = extract_ym_from_date(date_str)
            if ym:
                month_counts[ym] += 1

            day_val = get_val(row, ci["day"])
            in_val = get_val(row, ci["in"])
            out_val = get_val(row, ci["out"])
            shift_val = get_val(row, ci["shift"]) if ci["shift"] >= 0 else ""

            miss_in = is_punch_missing(in_val)
            miss_out = is_punch_missing(out_val)

            regDuty = get_num(row, ci["regDuty"])
            regOT = get_num(row, ci["regOT"])
            doDuty = get_num(row, ci["doDuty"])
            doOT = get_num(row, ci["doOT"])
            holDuty = get_num(row, ci["holDuty"])
            holOT = get_num(row, ci["holOT"])

            night_raw = get_val(row, ci["night"]).lower()
            shift_upper = (shift_val or "").upper()
            # 100% accurate night detection: checks Night column, Shift text (Night/C), or morning out with no in
            is_night = (
                night_raw in ("yes", "1", "true", "y") or
                "NIGHT" in shift_upper or
                shift_upper == "C" or
                (out_val and miss_in and any(x in shift_upper for x in ("NS", "NIGHT", "C")))
            )

            cur["daily"].append([
                date_str, day_val, in_val, out_val,
                regDuty, regOT, doDuty, doOT, holDuty, holOT,
                1 if is_night else 0, shift_val
            ])

            cur["dailyDuty"] += regDuty + regOT + doDuty + doOT + holDuty + holOT
            cur["dailyOt"] += regOT + doOT + holOT

            if regDuty > 0:
                cur["regularDaysCount"] += 1

            if doDuty > 0 or doOT > 0 or holDuty > 0 or holOT > 0:
                cur["holidayDays"].append({
                    "date": date_str,
                    "doDuty": doDuty,
                    "doExtra": doOT,
                    "holDuty": holDuty,
                    "holExtra": holOT
                })

            if is_night:
                cur["nightDays"].append(date_str)

            if miss_in or miss_out:
                cur["punchProblems"].append(date_str)
            elif (regDuty + doDuty + holDuty) > 0 and not is_night and (regOT + doOT + holOT) == 0:
                cur["plainDaysCount"] += 1

    flush()
    return out, month_counts

def main():
    print("=== Empress Excel to JSON Converter ===")
    
    if not RAW_DIR.exists():
        print(f"[WARN] Directory '{RAW_DIR}' does not exist. Creating it.")
        RAW_DIR.mkdir(parents=True, exist_ok=True)

    xlsx_files = sorted(RAW_DIR.glob("*.xlsx"))
    if not xlsx_files:
        print(f"[INFO] No .xlsx files found in '{RAW_DIR}'. Nothing to process.")
        sys.exit(0)

    area_map, details, rate_table = load_areas_json()
    print(f"[INFO] Loaded {len(area_map)} area assignments from areas.json")

    all_employees_map = {}
    total_month_counts = Counter()
    processed_files = 0

    for fpath in xlsx_files:
        print(f"[INFO] Parsing '{fpath.name}'...")
        try:
            wb = openpyxl.load_workbook(fpath, data_only=True)
            employees, month_counts = parse_workbook(wb, fpath.name, area_map, rate_table, details=details)
            print(f"       -> Extracted {len(employees)} employee records")
            for e in employees:
                eid = e["id"]
                if eid in all_employees_map:
                    all_employees_map[eid] = pick_best_employee(all_employees_map[eid], e)
                else:
                    all_employees_map[eid] = e
            total_month_counts.update(month_counts)
            processed_files += 1
        except Exception as err:
            print(f"[ERROR] Failed to parse '{fpath.name}': {err}")

    if not all_employees_map:
        print("[ERROR] No employee records could be parsed from raw files.")
        sys.exit(1)

    # Determine dominant month
    if total_month_counts:
        detected_month = total_month_counts.most_common(1)[0][0]
    else:
        now = datetime.datetime.now()
        detected_month = now.strftime("%Y-%m")

    print(f"[INFO] Target Month Detected: {detected_month}")
    print(f"[INFO] Total Unique Employees: {len(all_employees_map)}")

    employees_list = sorted(all_employees_map.values(), key=lambda x: x["id"])

    payload = {
        "month": detected_month,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "employees": employees_list
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Write data/{YYYY-MM}.json
    month_file = DATA_DIR / f"{detected_month}.json"
    with open(month_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[SUCCESS] Saved: {month_file} ({os.path.getsize(month_file):,} bytes)")

    # 2. Write data/latest.json
    latest_file = DATA_DIR / "latest.json"
    with open(latest_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[SUCCESS] Saved: {latest_file} ({os.path.getsize(latest_file):,} bytes)")

    print("[SUCCESS] Conversion completed successfully.")

if __name__ == "__main__":
    main()

