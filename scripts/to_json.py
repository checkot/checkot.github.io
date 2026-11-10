

#!/usr/bin/env python3
"""
to_json.py - Converts Empress HRIS Monthly Work Log Excel exports into
production-ready pre-indexed JSON for RPPF Admin Control Panel & In-Charge Portal.

Matches the exact parsing algorithms from RPPF_Dedicated_Admin_Control_Panel_v7-6.html:
- Column heuristic detection (detectWorkLogColumns)
- Summary sheet mapping (buildSummaryMap)
- Punch problem & missing time validation (cleanPunchValue & isPunchMissing)
- Regular/Holiday/DO/Night shift calculation
- Night = ONLY when Empress 'Night' column says YES. The app never declares a night by itself;
  it only raises a 'nightSuspects' flag when a day looks like a night but Empress has no YES.
- Requisition Problem Detection:
  * Detects days where duty is between 9.2h and 13.5h (e.g. 7:30 PM / 9:30 PM exit)
    but OT is 0.0 because ERP team hasn't created the OT requisition!
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

# Night is declared ONLY by Empress 'Night' column = YES (case-insensitive).
NIGHT_YES_VALUES = ("yes", "y")
# Day without YES but with this many hours of elapsed/recorded duty => raise a "night suspect" flag only.
NIGHT_SUSPECT_HOURS = 15.0

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
                        data.get("rateTable", DEFAULT_RATE_TABLE),
                        data.get("holidays", {}),
                        data.get("designationRates", {})
                    )
            except Exception as e:
                print(f"[WARN] Could not parse {p}: {e}")
    return {}, {}, DEFAULT_RATE_TABLE, {}, {}

def clean_punch_value(val):
    if val is None:
        return ""
    s = str(val)
    return re.sub(r'[\s   -‏-  　﻿]+', '', s).strip()

def get_num(row, col_idx):
    if row and 0 <= col_idx < len(row) and row[col_idx] is not None:
        try:
            return float(row[col_idx])
        except (ValueError, TypeError):
            return 0.0
    return 0.0

def get_val(row, col_idx):
    if row and 0 <= col_idx < len(row) and row[col_idx] is not None:
        return clean_punch_value(row[col_idx])
    return "" 

def is_punch_missing(val, other_val=None, duty_val=0):
    cleaned = clean_punch_value(val).upper()
    if not cleaned:
        return True
    if cleaned in ("-", "--", "N/A", "NA", "NULL", "NONE", "MISSING"):
        return True
    if cleaned in ("0000", "000000"):
        return True
    # If this punch is 00:00 (midnight), it is valid if the other punch exists or duty > 0
    if re.match(r'^0{1,2}:00(:00)?$', cleaned):
        if (other_val and not is_punch_missing(other_val)) or duty_val > 0:
            return False
        return True
    if not re.match(r'^\d{1,2}:\d{2}(:\d{2})?([AP]M)?$', cleaned, re.IGNORECASE):
        return True
    return False

def parse_time_mins(val):
    if not val:
        return None
    s = re.sub(r'[^0-9:APM]', '', str(val).strip().upper())
    if not s or s in ('-', '--', 'NA', 'NULL', '0000', '000000'):
        return None
    m = re.match(r'^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$', s)
    if m:
        hh, mm, ampm = int(m.group(1)), int(m.group(2)), m.group(3)
        if hh >= 24 or mm >= 60:
            return None
        if ampm == 'PM' and hh < 12: hh += 12
        elif ampm == 'AM' and hh == 12: hh = 0
        return hh * 60 + mm
    return None

def calc_elapsed_hours(in_str, out_str, shift_str="", duty_hrs=0.0):
    t_in = parse_time_mins(in_str)
    t_out = parse_time_mins(out_str)
    if t_in is None or t_out is None:
        return 0.0
    shift_upper = (shift_str or "").upper()
    is_24h_shift = "DN" in shift_upper or duty_hrs >= 20.0
    if t_out < t_in:
        diff_mins = (1440 - t_in) + t_out
    elif t_out == t_in and is_24h_shift:
        diff_mins = 1440
    else:
        diff_mins = t_out - t_in
        if is_24h_shift and diff_mins < 360:
            diff_mins += 1440
    return round(diff_mins / 60.0, 2)

def clean_emp_name(raw):
    if raw is None:
        return ""
    n = re.sub(r'[ ​-‍﻿]', ' ', str(raw))
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
    n = re.sub(r'[ ​-‍﻿]', ' ', str(raw))
    return re.sub(r'\s+', ' ', n).strip()

def parse_emp_header(col0, emp_id):
    rest = col0[len(emp_id):]
    rest = re.sub(r'[ ​-‍﻿]', ' ', rest).strip()
    parts = [x.strip() for x in rest.split(',')]
    name_desig = rest
    if len(parts) >= 3:
        name_desig = ', '.join(parts[:-2])
    m = re.match(r'^(.*?)\s{2,}(.+)$', name_desig)
    if m:
        return clean_emp_name(m.group(1)), clean_designation(m.group(2))
    g = re.match(r'^(.*?)\s+((?:Junior\s+Officer\s+[A-F]|Officer\s+[A-F]|Senior\s+Officer|Helper|Casual|Executive)\b.*)$', name_desig, re.IGNORECASE)
    if g:
        return clean_emp_name(g.group(1)), clean_designation(g.group(2))
    return clean_emp_name(name_desig), ""

def detect_category(grade_text, emp_id, desig_rates=None):
    g = (grade_text or "").upper().strip()
    id_upper = (emp_id or "").upper().strip()
    raw_key = (grade_text or "").strip().lower()

    # 1. Match designationRates from areas.json (e.g. Officer A -> R_55)
    if desig_rates:
        clean_k = re.sub(r'[\s ]+', ' ', re.split(r'[,/]', raw_key)[0]).strip()
        if clean_k in desig_rates:
            return {"category": desig_rates[clean_k], "valid": True, "reason": f"Designation Match ({clean_k})", "gradeText": g}
        for dk, dv in desig_rates.items():
            if re.search(r'' + re.escape(dk) + r'', raw_key):
                return {"category": dv, "valid": True, "reason": f"Designation Match ({dk})", "gradeText": g}

    # 2. Casual workers (numeric ID or Casual grade)
    if re.match(r"^\d{5,8}$", id_upper) or "CASUAL" in g:
        return {"category": "CF", "valid": True, "reason": "Casual Worker", "gradeText": g or "Casual"}

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
    s = str(date_str or "").strip()
    m1 = re.match(r'^\d{1,2}-([A-Za-z]{3})-(\d{4})$', s)
    if m1:
        mon_str = m1.group(1).upper()
        if mon_str in MONTH_NAMES:
            mon_num = MONTH_NAMES.index(mon_str) + 1
            return f"{m1.group(2)}-{mon_num:02d}"
    m2 = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})$', s)
    if m2:
        return f"{m2.group(1)}-{int(m2.group(2)):02d}"
    m3 = re.match(r'^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$', s)
    if m3:
        return f"{m3.group(3)}-{int(m3.group(2)):02d}"
    return None

def compute_general_absents_for_employee(daily_records, detected_hols=None, target_month=None):
    if not daily_records:
        return [], 0
    detected_hols = detected_hols or set()
    
    # Extract year and month
    y = 0
    m = 0
    if target_month:
        m_t = re.match(r'^(\d{4})-(\d{2})$', str(target_month).strip())
        if m_t:
            y = int(m_t.group(1))
            m = int(m_t.group(2))
    if not y or not m:
        for r in daily_records:
            if r and len(r) > 0 and r[0]:
                ym = extract_ym_from_date(r[0])
                if ym:
                    parts = ym.split('-')
                    y = int(parts[0])
                    m = int(parts[1])
                    break
    if not y or not m:
        now = datetime.datetime.now()
        y, m = now.year, now.month

    # Get number of days in month
    if m == 12:
        last_day = 31
    else:
        last_day = (datetime.date(y, m + 1, 1) - datetime.timedelta(days=1)).day

    worked_days = set()
    night_days = set()
    has_day1_morning_checkout = False

    for r in daily_records:
        if not r or not r[0]:
            continue
        parts = str(r[0]).split('-')
        if len(parts) >= 1 and parts[0].isdigit():
            d_num = int(parts[0])
            in_str = str(r[2] or '').strip()
            out_str = str(r[3] or '').strip()
            duty = float(r[4] or 0) + float(r[6] or 0) + float(r[8] or 0)
            ot = float(r[5] or 0) + float(r[7] or 0) + float(r[9] or 0)
            is_night = int(r[10] or 0) == 1  # Empress Night=YES only (never from shift code)

            if duty > 0 or ot > 0 or (in_str and in_str != '-') or (out_str and out_str != '-'):
                worked_days.add(d_num)
            if is_night:
                night_days.add(d_num)
            if d_num == 1 and out_str and (not in_str or in_str == '-'):
                t_m = parse_time_mins(out_str)
                if t_m is not None and t_m <= 435:
                    has_day1_morning_checkout = True

    absent_dates = []
    mon_name = MONTH_NAMES[m - 1]

    # Calculate cutoff day: do not count future days as absent!
    bd_now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=6)))
    is_current_month = (y == bd_now.year and m == bd_now.month)
    max_data_day = max(worked_days) if worked_days else 0
    if is_current_month:
        cutoff_day = min(last_day, max_data_day if max_data_day > 0 else bd_now.day)
    else:
        cutoff_day = last_day

    for d in range(1, cutoff_day + 1):
        dt_obj = datetime.date(y, m, d)
        day_name = dt_obj.strftime("%a")
        full_date = f"{d:02d}-{mon_name}-{y}".upper()

        # 1. Weekend exclusion (Thu & Fri only)
        if day_name in ("Thu", "Fri"):
            continue
        # 2. Govt Holiday exclusion
        if full_date in detected_hols:
            continue
        # 3. Night rest exclusion
        if d > 1 and (d - 1) in night_days:
            continue
        # 4. Day 1 Month Crossover Night Rest exclusion
        if d == 1 and has_day1_morning_checkout:
            continue

        if d not in worked_days:
            absent_dates.append(f"{d:02d}-{mon_name} ({day_name})")

    return absent_dates, len(absent_dates)

def finalize_excel_employee(c, source_name, area_map, rate_table, details=None, desig_rates=None, dept="PR"):
    detection = detect_category(c["designation"], c["id"], desig_rates=desig_rates)
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
    if dept == "QA":
        default_area = "Quality Assurance"
    else:
        default_area = "Packing Hall" if c["isRppf"] else "Other facility"
    area = area_map.get(c["id"], default_area) if area_map else default_area
    sub_val = details.get(c["id"], {}).get("s", "") if details else ""

    req_problems = c.get("requisitionProblems", [])

    return {
        "valid": valid,
        "id": c["id"],
        "name": c["name"][:45],
        "grade": c["designation"],
        "kind": kind,
        "category": category,
        "area": area,
        "sub": sub_val,
        "isRppf": c["isRppf"],
        "totalDuty": total_duty,
        "otHours": ot_hours,
        "holidayCount": holiday_count,
        "nightCount": night_count,
        "regularDaysCount": c["regularDaysCount"],
        "plainDaysCount": c["plainDaysCount"],
        "holidayDays": c["holidayDays"],
        "nightDays": c["nightDays"],
        "nightSuspects": c.get("nightSuspects", []),
        "nightSuspectCount": len(c.get("nightSuspects", [])),
        "punchProblems": c["punchProblems"],
        "requisitionProblems": req_problems,
        "requisitionProblemCount": len(req_problems),
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

def parse_workbook(wb, source_name, area_map, rate_table, details=None, holidays_cfg=None, desig_rates=None, dept="PR"):
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
            out.append(finalize_excel_employee(cur, source_name, area_map, rate_table, details=details, desig_rates=desig_rates, dept=dept))
            cur = None

    # Step A: Auto-detect Empress recognized Government/Company Holidays for this month
    detected_holidays = set()
    for r in rows:
        c0 = format_date_str(r[0] if r and len(r) > 0 else "")
        if re.match(r'^\d{2}-[A-Za-z]{3}-\d{4}$', c0):
            hol_d = get_num(r, ci["holDuty"])
            hol_o = get_num(r, ci["holOT"])
            if hol_d > 0 or hol_o > 0:
                detected_holidays.add(c0.upper())

    # Incorporate Admin Panel overrides (Tick / Untick)
    cancelled_hols = set((holidays_cfg or {}).get("cancelled", []))
    custom_hols = set((holidays_cfg or {}).get("custom", []))
    # Apply custom additions and exclude admin unticked/cancelled dates
    detected_holidays = (detected_holidays | custom_hols) - cancelled_hols

    for row in rows:
        if not row:
            continue
        raw_col0 = row[0]
        if raw_col0 is None:
            continue
        
        formatted_date = format_date_str(raw_col0)
        is_date_row = bool(re.match(r'^\d{2}-[A-Za-z]{3}-\d{4}$', formatted_date))
        
        col0_clean = re.sub(r'[ ​-‍﻿]', ' ', str(raw_col0)).strip()
        
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
                "nightSuspects": [],
                "punchProblems": [],
                "requisitionProblems": [],
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

            regDuty = get_num(row, ci["regDuty"])
            regOT = get_num(row, ci["regOT"])
            doDuty = get_num(row, ci["doDuty"])
            doOT = get_num(row, ci["doOT"])
            holDuty = get_num(row, ci["holDuty"])
            holOT = get_num(row, ci["holOT"])
            row_duty = regDuty + doDuty + holDuty

            miss_in = is_punch_missing(in_val, other_val=out_val, duty_val=row_duty)
            miss_out = is_punch_missing(out_val, other_val=in_val, duty_val=row_duty)

            elapsed_hrs = calc_elapsed_hours(in_val, out_val)
            t_in_mins = parse_time_mins(in_val)
            t_out_mins = parse_time_mins(out_val)

            night_raw = get_val(row, ci["night"]).lower()
            shift_upper = (shift_val or "").upper()
            
            # NIGHT RULE (strict): a day is a Night ONLY if the Empress 'Night' column says YES.
            # Shift code (DN/G/C), elapsed hours, morning punch-out etc. NEVER declare a night.
            is_night = night_raw in NIGHT_YES_VALUES

            # Night SUSPECT (flag only, never counted as night)
            night_suspect_reason = ""
            if not is_night:
                total_all_today = regDuty + regOT + doDuty + doOT + holDuty + holOT
                if "NIGHT" in shift_upper or shift_upper in ("C", "DN"):
                    night_suspect_reason = f"Shift '{shift_val}' but Night is not marked YES in Empress"
                elif (out_val and miss_in and t_out_mins is not None and 240 <= t_out_mins <= 435):
                    night_suspect_reason = "Morning punch-out without In punch (possible night duty)"
                elif elapsed_hrs >= NIGHT_SUSPECT_HOURS or total_all_today >= NIGHT_SUSPECT_HOURS:
                    night_suspect_reason = f"Very long duty ({max(elapsed_hrs, total_all_today):.1f}h) but Night is not marked YES in Empress"

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
            elif night_suspect_reason:
                cur["nightSuspects"].append({
                    "date": date_str, "day": day_val, "in": in_val, "out": out_val,
                    "duty": round(regDuty + regOT + doDuty + doOT + holDuty + holOT, 2),
                    "elapsed": elapsed_hrs, "shift": shift_val,
                    "reason": night_suspect_reason
                })

            if miss_in or miss_out:
                cur["punchProblems"].append(date_str)
            elif (regDuty + doDuty + holDuty) > 0 and not is_night and (regOT + doOT + holOT) == 0:
                cur["plainDaysCount"] += 1

            # -------------------------------------------------------------
            # COMPREHENSIVE REQUISITION AUDIT (OT, Weekend DO, Govt Holiday)
            # -------------------------------------------------------------
            total_ot_today = regOT + doOT + holOT
            total_duty_today = regDuty + doDuty + holDuty
            date_upper = date_str.upper()

            is_req_problem = False
            expected_ot_str = ""
            prob_reason = ""

            # 1. Government Holiday Requisition Missing
            # Worked on Govt Holiday, but hours went to regDuty/regOT instead of holDuty/holOT!
            if date_upper in detected_holidays and (regDuty > 0 or regOT > 0) and (holDuty == 0 and holOT == 0):
                is_req_problem = True
                expected_ot_str = "Govt Holiday Requisition Missing"
                prob_reason = "Worked on Govt Holiday, but recorded as Regular Duty"

            # 2. Weekend Day Off (DO) Requisition Missing (Thu & Fri Only)
            # Worked on Thu or Fri, but hours went to regDuty/regOT instead of doDuty/doOT!
            elif day_val in ("Thu", "Fri") and (regDuty > 0 or regOT > 0) and (doDuty == 0 and doOT == 0):
                is_req_problem = True
                expected_ot_str = f"Weekend ({day_val}) DO Req Missing"
                prob_reason = "Worked on Weekend (Thu/Fri), but recorded as Regular Duty"

            # 3. Night Shift OT Requisition Missing (Case: Numan)
            elif is_night and (elapsed_hrs >= 11.0 or total_duty_today >= 11.0) and total_ot_today == 0.0 and not miss_in and not miss_out:
                is_req_problem = True
                exp_hrs = min(7.0, max(4.0, round(max(elapsed_hrs, total_duty_today) - 8.5, 1)))
                expected_ot_str = f"{exp_hrs}h (Night Shift OT Error / Missing)"
                prob_reason = "Night Shift OT Missing"

            # 4. Standard Evening/Morning Overtime Missing
            elif not is_night and total_ot_today == 0.0 and not miss_in and not miss_out:
                if t_out_mins is not None and 1150 <= t_out_mins <= 1215:
                    is_req_problem = True
                    expected_ot_str = "3.0h (04:30 - 07:30 PM)"
                    prob_reason = "3h Evening OT Missing"
                elif t_out_mins is not None and 1216 <= t_out_mins <= 1350:
                    is_req_problem = True
                    expected_ot_str = "5.0h (04:30 - 09:30 PM)"
                    prob_reason = "5h Evening OT Missing"
                elif t_in_mins is not None and t_in_mins <= 435:
                    is_req_problem = True
                    expected_ot_str = "2.5h Morning OT" if t_in_mins <= 390 else "1.0h Morning OT"
                    prob_reason = "Morning OT Missing"
                elif 9.5 <= elapsed_hrs <= 13.5 and (t_out_mins is not None and t_out_mins > 1035):
                    is_req_problem = True
                    expected_ot_str = f"{round(elapsed_hrs - 8.5, 1)}h Extended OT"
                    prob_reason = "Day OT Missing"

            if is_req_problem:
                cur["requisitionProblems"].append({
                    "date": date_str,
                    "day": day_val,
                    "in": in_val,
                    "out": out_val,
                    "duty": round(total_duty_today, 2),
                    "elapsed": elapsed_hrs,
                    "isNight": is_night,
                    "expectedOt": expected_ot_str,
                    "reason": prob_reason
                })

    flush()
    return out, month_counts

# =============================================================================
# RAW ARCHIVE  (lossless copy of the Excel, so logic can be re-run WITHOUT re-uploading Excel)
# -----------------------------------------------------------------------------
# data/YYYY-MM.raw.json holds every cell of every sheet of every Excel file used for that month.
# scripts/recompute_from_raw.py rebuilds data/YYYY-MM.json from it using the SAME parser code above.
# See DATA_GUIDE.md for the format and the "how do I change a rule" cheat-sheet.
# =============================================================================
PARSER_VERSION = "2026-11-05-night-yes-only"
ARCHIVE_DIR = DATA_DIR  # data/YYYY-MM.raw.json (matches the existing workflows' `git add data/*.json`)
ARCHIVE_SCHEMA = 1


def _enc_cell(v):
    if v is None or isinstance(v, (str, bool, int, float)):
        return v
    if isinstance(v, datetime.datetime):
        return "@dt:" + v.isoformat()
    if isinstance(v, datetime.date):
        return "@d:" + v.isoformat()
    if isinstance(v, datetime.time):
        return "@t:" + v.isoformat()
    if isinstance(v, datetime.timedelta):
        return "@td:" + repr(v.total_seconds())
    return str(v)


def _dec_cell(v):
    if isinstance(v, str) and v.startswith("@"):
        try:
            if v.startswith("@dt:"):
                return datetime.datetime.fromisoformat(v[4:])
            if v.startswith("@d:"):
                return datetime.date.fromisoformat(v[3:])
            if v.startswith("@t:"):
                return datetime.time.fromisoformat(v[3:])
            if v.startswith("@td:"):
                return datetime.timedelta(seconds=float(v[4:]))
        except ValueError:
            return v
    return v


def dump_workbook(wb):
    """Every sheet, every row, every cell. Empty rows are kept as [] so row positions never shift."""
    sheets = []
    for ws in wb.worksheets:
        rows = []
        for r in ws.iter_rows(values_only=True):
            cells = [_enc_cell(c) for c in r]
            while cells and cells[-1] is None:
                cells.pop()
            rows.append(cells)
        while rows and not rows[-1]:
            rows.pop()
        sheets.append({"name": ws.title, "rows": rows})
    return {"sheets": sheets}


def rebuild_workbook(dump):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for sh in dump.get("sheets", []):
        ws = wb.create_sheet(title=sh.get("name") or "Sheet")
        for r in sh.get("rows", []):
            ws.append([_dec_cell(c) for c in r])
    return wb


def write_archive(month, file_dumps, target_dir=None):
    """file_dumps = [(source_file_name, dump_workbook(...)), ...]. One row per line so git diffs / AI reads stay sane."""
    adir = target_dir if target_dir is not None else ARCHIVE_DIR
    adir.mkdir(parents=True, exist_ok=True)
    path = adir / f"{month}.raw.json"
    head = {
        "schema": ARCHIVE_SCHEMA,
        "month": month,
        "parserVersion": PARSER_VERSION,
        "archivedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "about": "Lossless copy of the Empress Excel cells. Cell tags: @dt:/@d:/@t:/@td: = datetime/date/time/duration. "
                 "Rebuild data/<month>.json with: python scripts/recompute_from_raw.py <month>. See DATA_GUIDE.md."
    }
    out = ["{"]
    out.append(json.dumps(head, ensure_ascii=False)[1:-1] + ',')
    out.append('"files":[')
    fparts = []
    for name, dump in file_dumps:
        sparts = []
        for sh in dump["sheets"]:
            rows = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in sh["rows"])
            sparts.append('{"name":' + json.dumps(sh["name"], ensure_ascii=False) + ',"rows":[\n' + rows + '\n]}')
        fparts.append('{"name":' + json.dumps(name, ensure_ascii=False) + ',"sheets":[\n' + ",\n".join(sparts) + '\n]}')
    out.append(",\n".join(fparts))
    out.append("]}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"[SUCCESS] Archived raw Excel cells: {path} ({os.path.getsize(path):,} bytes)")


def build_month(named_workbooks, archive=True, update_latest=True, force_month=None, dept="PR", out_dir=None):
    """named_workbooks = [(file_name, openpyxl_workbook), ...] -> writes data/<month>.json (+ archive, + latest)."""
    area_map, details, rate_table, holidays_cfg, desig_rates = load_areas_json()
    print(f"[INFO] Loaded {len(area_map)} area assignments from areas.json")

    all_employees_map = {}
    total_month_counts = Counter()
    file_dumps = []

    for fname, wb in named_workbooks:
        print(f"[INFO] Parsing '{fname}'...")
        try:
            employees, month_counts = parse_workbook(wb, fname, area_map, rate_table, details=details, holidays_cfg=holidays_cfg, desig_rates=desig_rates, dept=dept)
            print(f"       -> Extracted {len(employees)} employee records")
            for e in employees:
                eid = e["id"]
                if eid in all_employees_map:
                    all_employees_map[eid] = pick_best_employee(all_employees_map[eid], e)
                else:
                    all_employees_map[eid] = e
            total_month_counts.update(month_counts)
            if archive:
                file_dumps.append((fname, dump_workbook(wb)))
        except Exception as err:
            print(f"[ERROR] Failed to parse '{fname}': {err}")

    if not all_employees_map:
        print("[ERROR] No employee records could be parsed from the Excel data.")
        sys.exit(1)

    if total_month_counts:
        detected_month = total_month_counts.most_common(1)[0][0]
    else:
        detected_month = datetime.datetime.now().strftime("%Y-%m")
    if force_month and force_month != detected_month:
        print(f"[WARN] Detected month {detected_month} differs from archive month {force_month}; using {force_month}.")
        detected_month = force_month

    print(f"[INFO] Target Month Detected: {detected_month}")
    print(f"[INFO] Total Unique Employees: {len(all_employees_map)}")

    employees_list = sorted(all_employees_map.values(), key=lambda x: x["id"])
    total_req_probs = sum(e.get("requisitionProblemCount", 0) for e in employees_list)
    print(f"[INFO] Detected {total_req_probs} Overtime Requisition Problems across employees.")

    payload = {
        "month": detected_month,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "employees": employees_list
    }

    target_dir = out_dir if out_dir is not None else (DATA_DIR / "qa" if dept == "QA" else DATA_DIR)
    target_dir.mkdir(parents=True, exist_ok=True)
    month_file = target_dir / f"{detected_month}.json"
    with open(month_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[SUCCESS] Saved ({dept}): {month_file} ({os.path.getsize(month_file):,} bytes)")

    if archive and file_dumps:
        try:
            write_archive(detected_month, file_dumps, target_dir=target_dir)
        except Exception as err:
            # Archive must never break the normal data update.
            print(f"[WARN] Could not write raw archive: {err}")

    min_latest_count = 1 if dept == "QA" else 50
    if update_latest and len(all_employees_map) >= min_latest_count:
        latest_file = target_dir / "latest.json"
        with open(latest_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"[SUCCESS] Saved ({dept}): {latest_file} ({os.path.getsize(latest_file):,} bytes)")
    else:
        print(f"[INFO] latest.json not touched (employees={len(all_employees_map)}, update_latest={update_latest}).")
    return detected_month


def main():
    print("=== Empress Excel to JSON Converter (Production & QA) ===")

    if not RAW_DIR.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Check QA Excel files in raw/qa/
    raw_qa_dir = RAW_DIR / "qa"
    qa_files = sorted(raw_qa_dir.glob("*.xlsx")) if raw_qa_dir.exists() else []
    if qa_files:
        print(f"[INFO] Found {len(qa_files)} QA Excel file(s) in '{raw_qa_dir}'")
        named_qa = []
        for fpath in qa_files:
            try:
                named_qa.append((fpath.name, openpyxl.load_workbook(fpath, data_only=True)))
            except Exception as err:
                print(f"[ERROR] Failed to open QA file '{fpath.name}': {err}")
        if named_qa:
            build_month(named_qa, archive=True, update_latest=True, dept="QA", out_dir=DATA_DIR / "qa")

    # 2. Check PR Excel files in raw/pr/ and top-level raw/
    raw_pr_dir = RAW_DIR / "pr"
    pr_files = []
    if raw_pr_dir.exists():
        pr_files.extend(sorted(raw_pr_dir.glob("*.xlsx")))
    for f in sorted(RAW_DIR.glob("*.xlsx")):
        if f.is_file():
            pr_files.append(f)

    if pr_files:
        print(f"[INFO] Found {len(pr_files)} Production Excel file(s)")
        named_pr = []
        for fpath in pr_files:
            try:
                named_pr.append((fpath.name, openpyxl.load_workbook(fpath, data_only=True)))
            except Exception as err:
                print(f"[ERROR] Failed to open Production file '{fpath.name}': {err}")
        if named_pr:
            build_month(named_pr, archive=True, update_latest=True, dept="PR", out_dir=DATA_DIR)

    if not qa_files and not pr_files:
        print(f"[INFO] No .xlsx files found in '{RAW_DIR}', '{raw_qa_dir}', or '{raw_pr_dir}'. Nothing to process.")
        sys.exit(0)

    # Auto-stage data/qa/ output and clean raw/qa, raw/pr for git commit in manual-excel workflow
    try:
        import subprocess
        subprocess.run("git add data/qa/*.json 2>/dev/null || true", shell=True, check=False)
        subprocess.run("git rm -f --ignore-unmatch raw/qa/*.xlsx raw/qa/*.XLSX raw/pr/*.xlsx raw/pr/*.XLSX 2>/dev/null || true", shell=True, check=False)
        for f in list(raw_qa_dir.glob("*.xlsx")) + list(raw_pr_dir.glob("*.xlsx")):
            try:
                f.unlink()
            except Exception:
                pass
    except Exception:
        pass

    print("[SUCCESS] All departmental conversions completed successfully.")

if __name__ == "__main__":
    main()
