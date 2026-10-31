

#!/usr/bin/env python3
"""
RPPF Attendance & Punch Analyzer (WhatsApp Alert & OT Requisition Engine)
========================================================================
- Automatically detects employee punch status for today (Present, Late, Absent)
- 100% EXCLUDES previous-day night shift workers (including Month-End crossover to Day 1)
- Automatically EXCLUDES employees on Approved Long-Term Leave (Maternity Leave, Sick Leave, etc.)
- General Shift Tracking: 08:00 AM - 04:30 PM (In: 07:20 - 08:10, Out: 16:20 - 17:15)
- Intelligent Overtime (OT) Package Detection:
  * 3-Hour Evening OT: 04:30 PM - 07:30 PM (Out: 19:10 - 20:15)
  * 5-Hour Evening OT: 04:30 PM - 09:30 PM (Out: 21:10 - 22:30)
  * Morning Pre-shift OT: 06:00 - 08:30 (2.5h) or 07:00 - 08:00 (1.0h)
- ERP OT Requisition Mismatch Detection:
  * Identifies workers who physically worked 9.2h to 13.5h (e.g. left at 7:30 PM or 9:30 PM)
    but have 0 OT in Empress because ERP team hasn't created the OT requisition yet!
- Generates an executive "Manager View" overview with counts for JO, CF, Executive
- WhatsApp character limit safety with smart chunking
"""

import os
import sys
import json
import re
import datetime
import requests

def get_bd_now():
    # Bangladesh Standard Time is UTC+6
    bd_tz = datetime.timezone(datetime.timedelta(hours=6))
    return datetime.datetime.now(bd_tz)

def normalize_id(emp_id):
    if not emp_id:
        return ""
    return str(emp_id).strip().upper()

def load_json_file(filepath, default=None):
    if not os.path.exists(filepath):
        return default if default is not None else {}
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[WARN] Failed to read {filepath}: {e}")
        return default if default is not None else {}

def is_punch_missing(val):
    if val is None:
        return True
    s = str(val).strip().upper().replace(":", "")
    if not s or s in ("-", "--", "NA", "N/A", "NULL", "NONE", "MISSING", "0000", "000000"):
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
        if ampm == 'PM' and hh < 12: hh += 12
        elif ampm == 'AM' and hh == 12: hh = 0
        return hh * 60 + mm
    return None

def calc_elapsed_hours(in_str, out_str):
    t_in = parse_time_mins(in_str)
    t_out = parse_time_mins(out_str)
    if t_in is None or t_out is None:
        return 0.0
    if t_out < t_in:
        diff_mins = (1440 - t_in) + t_out
    else:
        diff_mins = t_out - t_in
    return round(diff_mins / 60.0, 2)

def get_category_type(emp_id, emp_grade="", emp_meta_type=""):
    u_id = normalize_id(emp_id)
    if emp_meta_type:
        return emp_meta_type
    if u_id.startswith("CF") or "HELPER" in str(emp_grade).upper() or "CONTRACTUAL" in str(emp_grade).upper():
        return "CON"
    if u_id.startswith("RF"):
        g = str(emp_grade).upper()
        if "JUNIOR OFFICER" in g:
            return "JO"
        return "EXEC"
    if re.match(r"^\d{5,8}$", u_id) or "CASUAL" in str(emp_grade).upper():
        return "CAS"
    return "CON"

def get_category_label(cat_type):
    labels = {
        "JO": "Junior Officer (JO)",
        "CON": "Contractual (CF)",
        "EXEC": "Executive / Staff (RF)",
        "CAS": "Casual"
    }
    return labels.get(cat_type, "Staff")

def main():
    now_bd = get_bd_now()
    today_iso = now_bd.strftime("%Y-%m-%d")
    today_emp_format = now_bd.strftime("%d-%b-%Y").upper()
    current_month_str = now_bd.strftime("%Y-%m")
    
    yesterday_bd = now_bd - datetime.timedelta(days=1)
    yesterday_iso = yesterday_bd.strftime("%Y-%m-%d")
    yesterday_emp_format = yesterday_bd.strftime("%d-%b-%Y").upper()
    yesterday_month_str = yesterday_bd.strftime("%Y-%m")

    print("=== RPPF Attendance & OT Analysis ===")
    print(f"Current BD Time: {now_bd.strftime('%Y-%m-%d %I:%M %p')}")
    print(f"Target Date: {today_emp_format} ({today_iso})")
    print(f"Yesterday: {yesterday_emp_format} ({yesterday_iso})")

    # 1. Load areas.json
    areas_data = load_json_file("areas.json", {})
    area_map = areas_data.get("areas", {})
    area_details = areas_data.get("details", {})

    if not area_map:
        print("[ERROR] areas.json is empty or missing! Cannot map employees to production areas.")
        sys.exit(0)

    # 2. Load approved long-term leaves (from absent.json or leaves.json)
    absent_data = load_json_file("absent.json", {})
    long_term_leaves = absent_data.get("longTermLeaves", [])
    standalone_leaves = load_json_file("leaves.json", {}).get("leaves", [])
    if standalone_leaves:
        long_term_leaves.extend(standalone_leaves)

    active_leaves_map = {}
    for l in long_term_leaves:
        if l.get("status", "Active") in ("Active", "active", "APPROVED", "Approved"):
            l_id = normalize_id(l.get("id"))
            s_date = l.get("startDate", "1970-01-01")
            e_date = l.get("endDate", "2099-12-31")
            if s_date <= today_iso <= e_date:
                active_leaves_map[l_id] = l

    print(f"Active approved leaves covering today: {len(active_leaves_map)}")

    # 3. Load latest monthly data (data/latest.json or data/YYYY-MM.json)
    latest_data = load_json_file("data/latest.json", {})
    month_data = load_json_file(f"data/{current_month_str}.json", {})
    
    employees_list = latest_data.get("employees", []) or month_data.get("employees", [])
    if isinstance(month_data, list) and not employees_list:
        employees_list = month_data

    emp_records = {normalize_id(e.get("id")): e for e in employees_list if e.get("id")}
    print(f"Loaded {len(emp_records)} employee records from current month data.")

    # Day 1 of Month Crossover Check: Load previous month data
    prev_month_records = {}
    if now_bd.day == 1 and yesterday_month_str != current_month_str:
        p_data = load_json_file(f"data/{yesterday_month_str}.json", {})
        p_list = p_data.get("employees", []) if isinstance(p_data, dict) else (p_data if isinstance(p_data, list) else [])
        prev_month_records = {normalize_id(e.get("id")): e for e in p_list if e.get("id")}
        print(f"Loaded {len(prev_month_records)} records from previous month ({yesterday_month_str}) for month-end night rest check.")

    allowed_sections = ["Solid Production", "Softgel Production", "Packing Hall", "Overall"]

    stats = {
        "total_listed": 0,
        "present": 0,
        "on_time": 0,
        "late": 0,
        "absent": 0,
        "night_rest": 0,
        "approved_leave": 0,
        "ot_done_total": 0,
        "ot_req_missing": 0,
        "by_category": {
            "JO": {"total": 0, "present": 0, "absent": 0},
            "CON": {"total": 0, "present": 0, "absent": 0},
            "EXEC": {"total": 0, "present": 0, "absent": 0},
            "CAS": {"total": 0, "present": 0, "absent": 0}
        }
    }

    absent_by_area_sub = {
        "Solid Production": {},
        "Softgel Production": {},
        "Packing Hall": {},
        "Overall": {}
    }

    late_employees = []
    missing_ot_requisition_list = []

    for raw_id, area_name in area_map.items():
        emp_id = normalize_id(raw_id)
        if area_name not in allowed_sections:
            continue

        emp_meta = area_details.get(emp_id, {})
        emp_sub = emp_meta.get("s", "").strip() or "General"
        emp_type = get_category_type(emp_id, emp_meta_type=emp_meta.get("t", ""))

        emp_rec = emp_records.get(emp_id, {})
        emp_name = emp_rec.get("name") or emp_id
        emp_grade = emp_rec.get("grade") or ""

        if emp_type == "CON" and "JUNIOR OFFICER" in emp_grade.upper():
            emp_type = "JO"

        stats["total_listed"] += 1
        stats["by_category"][emp_type]["total"] += 1

        # Check 1: Approved Long-Term Leave (Maternity Leave, Extended Medical, etc.)
        if emp_id in active_leaves_map:
            stats["approved_leave"] += 1
            stats["by_category"][emp_type]["present"] += 1
            leave_info = active_leaves_map[emp_id]
            print(f"[EXEMPT - LEAVE] {emp_id} ({emp_name}): {leave_info.get('type', 'Approved Leave')}")
            continue

        daily_log = emp_rec.get("daily", [])
        today_row = None
        yesterday_row = None

        for idx, row in enumerate(daily_log):
            r_date = str(row[0]).strip().upper() if len(row) > 0 else ""
            if r_date == today_emp_format:
                today_row = row
                if idx > 0:
                    yesterday_row = daily_log[idx - 1]
            elif r_date == yesterday_emp_format and yesterday_row is None:
                yesterday_row = row

        # If Day 1 of month, check previous month file for yesterday's night shift
        if yesterday_row is None and prev_month_records.get(emp_id):
            p_daily = prev_month_records[emp_id].get("daily", [])
            for r in p_daily:
                if str(r[0]).strip().upper() == yesterday_emp_format:
                    yesterday_row = r
                    break

        is_present = False
        today_in = ""
        today_out = ""
        reg_ot = 0.0
        do_ot = 0.0
        hol_ot = 0.0

        if today_row:
            today_in = str(today_row[2]).strip() if len(today_row) > 2 else ""
            today_out = str(today_row[3]).strip() if len(today_row) > 3 else ""
            reg_duty = float(today_row[4]) if len(today_row) > 4 and str(today_row[4]).replace('.','',1).isdigit() else 0.0
            reg_ot = float(today_row[5]) if len(today_row) > 5 and str(today_row[5]).replace('.','',1).isdigit() else 0.0
            do_ot = float(today_row[7]) if len(today_row) > 7 and str(today_row[7]).replace('.','',1).isdigit() else 0.0
            hol_ot = float(today_row[9]) if len(today_row) > 9 and str(today_row[9]).replace('.','',1).isdigit() else 0.0

            if (not is_punch_missing(today_in)) or (not is_punch_missing(today_out)) or (reg_duty > 0) or (reg_ot > 0):
                is_present = True

        # Check 2: Night Shift Exemption (Including Month-End crossover)
        is_night_exempt = False

        if yesterday_row:
            is_night_flag = int(yesterday_row[10]) == 1 if len(yesterday_row) > 10 and str(yesterday_row[10]).isdigit() else False
            shift_str = str(yesterday_row[11]).strip().upper() if len(yesterday_row) > 11 else ""
            if is_night_flag or "NIGHT" in shift_str:
                is_night_exempt = True
                print(f"[EXEMPT - NIGHT REST] {emp_id} ({emp_name}) worked Night Shift yesterday ({yesterday_emp_format}).")

        # Night checkout morning punch (04:00 - 07:15 AM OUT without morning IN)
        t_out_mins = parse_time_mins(today_out)
        t_in_mins = parse_time_mins(today_in)

        if not is_night_exempt and today_row and not is_punch_missing(today_out) and is_punch_missing(today_in):
            if t_out_mins is not None and (240 <= t_out_mins <= 435): # 04:00 AM - 07:15 AM
                is_night_exempt = True
                print(f"[EXEMPT - NIGHT EXIT] {emp_id} ({emp_name}) clocked out this morning at {today_out}.")

        if is_night_exempt:
            stats["night_rest"] += 1
            stats["by_category"][emp_type]["present"] += 1
            continue

        if is_present:
            stats["present"] += 1
            stats["by_category"][emp_type]["present"] += 1

            # On-Time vs Late Check
            if t_in_mins is not None:
                if t_in_mins <= 490: # <= 08:10 AM
                    stats["on_time"] += 1
                elif 491 <= t_in_mins <= 570: # 08:11 - 09:30 AM
                    stats["late"] += 1
                    late_employees.append({
                        "id": emp_id,
                        "name": emp_name,
                        "area": area_name,
                        "sub": emp_sub,
                        "in": today_in
                    })
                else:
                    stats["late"] += 1

            # Overtime & ERP Requisition Mismatch Detection
            total_recorded_ot = reg_ot + do_ot + hol_ot
            elapsed_hrs = calc_elapsed_hours(today_in, today_out)

            # OT Package Recognition:
            is_physical_ot = False
            detected_ot_desc = ""

            if t_out_mins is not None and t_out_mins >= 1150: # Out at or after 07:10 PM
                is_physical_ot = True
                if 1150 <= t_out_mins <= 1215:
                    detected_ot_desc = "3h Evening OT (04:30 - 07:30 PM)"
                elif 1216 <= t_out_mins <= 1350:
                    detected_ot_desc = "5h Evening OT (04:30 - 09:30 PM)"
                else:
                    detected_ot_desc = "Extended Night OT"
            elif t_in_mins is not None and t_in_mins <= 435: # In at or before 07:15 AM
                is_physical_ot = True
                if t_in_mins <= 390:
                    detected_ot_desc = "2.5h Morning OT (06:00 - 08:30 AM)"
                else:
                    detected_ot_desc = "1.0h Morning OT (07:00 - 08:00 AM)"
            elif elapsed_hrs > 9.5 and (t_out_mins is not None and t_out_mins > 1035):
                is_physical_ot = True
                detected_ot_desc = f"{round(elapsed_hrs - 8.5, 1)}h Extended OT"

            if is_physical_ot:
                stats["ot_done_total"] += 1
                # USER RULE: If worked 9.2h to 13.5h but Empress OT is 0.0
                if total_recorded_ot == 0.0:
                    stats["ot_req_missing"] += 1
                    missing_ot_requisition_list.append({
                        "id": emp_id,
                        "name": emp_name,
                        "area": area_name,
                        "sub": emp_sub,
                        "in": today_in,
                        "out": today_out,
                        "elapsed": elapsed_hrs,
                        "expected_ot": detected_ot_desc
                    })
                    print(f"[REQUISITION MISSING] {emp_id} ({emp_name}): {detected_ot_desc} (Elapsed {elapsed_hrs}h), but Empress OT = 0.0")

            continue

        # Employee is Absent
        stats["absent"] += 1
        stats["by_category"][emp_type]["absent"] += 1

        if emp_sub not in absent_by_area_sub[area_name]:
            absent_by_area_sub[area_name][emp_sub] = []

        absent_by_area_sub[area_name][emp_sub].append({
            "id": emp_id,
            "name": emp_name,
            "designation": emp_grade or get_category_label(emp_type),
            "type": emp_type
        })

    print("\n--- Summary ---")
    print(f"Total Listed: {stats['total_listed']}")
    print(f"Present: {stats['present']} (On-time: {stats['on_time']}, Late: {stats['late']})")
    print(f"Absent: {stats['absent']}")
    print(f"Night Rest Exempt: {stats['night_rest']}")
    print(f"Approved Leave Exempt: {stats['approved_leave']}")
    print(f"Physical OT Total: {stats['ot_done_total']} (ERP Requisition Missing: {stats['ot_req_missing']})")

    formatted_date_bd = now_bd.strftime("%d-%b-%Y")
    formatted_time_bd = now_bd.strftime("%I:%M %p")

    # Manager Overview Header
    overview_lines = [
        "📊 *RPPF DAILY ATTENDANCE & SHIFT REPORT*",
        f"📅 *তারিখ:* {formatted_date_bd} | *সময়:* {formatted_time_bd}",
        "━━━━━━━━━━━━━━━━━━━━",
        "👔 *MANAGER OVERVIEW (ম্যানেজার সামারি)*",
        "━━━━━━━━━━━━━━━━━━━━",
        f"👥 মোট সক্রিয় কর্মী: {stats['total_listed']} জন",
        f"✅ মোট উপস্থিত: {stats['present']} জন (সময়মতো: {stats['on_time']} | ⏰ লেট: {stats['late']})",
        f"❌ অনুপস্থিত (Absent): *{stats['absent']} জন*",
        f"🌙 নাইট রেস্ট (Night Rest): {stats['night_rest']} জন (বাদ)",
        f"🏥 মাতৃত্ব/অনুমোদিত ছুটি: {stats['approved_leave']} জন (বাদ)",
        "",
        "📌 *ক্যাটাগরি ভিত্তিক ওভারভিউ:*",
        f"• *Junior Officer (JO):* উপস্থিত {stats['by_category']['JO']['present']} | অনুপস্থিত *{stats['by_category']['JO']['absent']}*",
        f"• *Contractual (CF):* উপস্থিত {stats['by_category']['CON']['present']} | অনুপস্থিত *{stats['by_category']['CON']['absent']}*",
        f"• *Executive / Staff:* উপস্থিত {stats['by_category']['EXEC']['present']} | অনুপস্থিত *{stats['by_category']['EXEC']['absent']}*"
    ]

    if stats["ot_req_missing"] > 0:
        overview_lines.append(f"⚠️ *ওটি রিকুইজিশন মিসিং:* *{stats['ot_req_missing']} জন* (পাঞ্চে ওটি আছে, কিন্তু ERP পেন্ডিং)")

    overview_lines.append("━━━━━━━━━━━━━━━━━━━━")
    overview_text = "\n".join(overview_lines) + "\n"

    # Missing OT Requisition Section
    req_missing_lines = []
    if missing_ot_requisition_list:
        req_missing_lines = [
            f"🚨 *ওভারটাইম রিকুইজিশন মিসিং অ্যালার্ট ({len(missing_ot_requisition_list)} জন)*",
            "_(কর্মী ৯-১৩+ ঘণ্টা ওটি করেছেন, কিন্তু Empress-এ ওটি আওয়ার ০ দেখাচ্ছে)_"
        ]
        for r in missing_ot_requisition_list[:15]:
            req_missing_lines.append(f"  • `{r['id']}` - {r['name']} ({r['area']})\n    └ পাঞ্চ: {r['in']} ➔ {r['out']} | {r['expected_ot']}")
        if len(missing_ot_requisition_list) > 15:
            req_missing_lines.append(f"  ...এবং আরও {len(missing_ot_requisition_list) - 15} জন।")
        req_missing_lines.append("━━━━━━━━━━━━━━━━━━━━")
    req_missing_block = ("\n".join(req_missing_lines) + "\n") if req_missing_lines else ""

    # Late Arrival Section
    late_lines = []
    if late_employees and len(late_employees) <= 20:
        late_lines = ["⏰ *দেরিতে উপস্থিত কর্মীবৃন্দ (০৮:১১ - ০৯:০০):*"]
        for l in late_employees:
            late_lines.append(f"  • `{l['id']}` - {l['name']} ({l['in']}) - {l['sub']}")
        late_lines.append("━━━━━━━━━━━━━━━━━━━━")
    late_block = ("\n".join(late_lines) + "\n") if late_lines else ""

    area_headers = {
        "Solid Production": "💊 *SOLID PRODUCTION*",
        "Softgel Production": "💧 *SOFTGEL PRODUCTION*",
        "Packing Hall": "📦 *PACKING HALL*",
        "Overall": "👔 *EXECUTIVES & GENERAL*"
    }

    area_blocks = {}
    for area_key in ["Solid Production", "Softgel Production", "Packing Hall", "Overall"]:
        subs_dict = absent_by_area_sub.get(area_key, {})
        total_area_absent = sum(len(emps) for emps in subs_dict.values())
        
        block = f"{area_headers[area_key]} (অনুপস্থিত: *{total_area_absent}*)\n"
        if total_area_absent == 0:
            block += "  ✓ আলহামদুলিল্লাহ, এই সেকশনে কেউ অনুপস্থিত নেই।\n\n"
        else:
            for sub_name, emp_list in sorted(subs_dict.items()):
                if not emp_list:
                    continue
                block += f"  ▸ *{sub_name}:* ({len(emp_list)} জন)\n"
                for emp in sorted(emp_list, key=lambda x: x["id"]):
                    tag = f"({emp['type']})"
                    block += f"    • `{emp['id']}` - {emp['name']} {tag}\n"
            block += "\n"
        area_blocks[area_key] = block

    footer_text = (
        "━━━━━━━━━━━━━━━━━━━━\n"
        "💡 *ফিল্টারিং রুলস:* আগের দিন নাইট ডিউটি ও মেটারনিটি ছুটিতে থাকা কর্মীরা এই তালিকা থেকে সম্পূর্ণ মুক্ত।\n"
        "🤖 _RPPF Automated Production & Shift Intelligence Engine_"
    )

    full_message = (
        overview_text + 
        req_missing_block + 
        late_block + 
        "\n📋 *সেকশন ও সাব-সেকশন ভিত্তিক অনুপস্থিত তালিকা:*\n\n" + 
        "".join(area_blocks.values()) + 
        footer_text
    )

    messages_to_send = []
    if len(full_message) <= 3400:
        messages_to_send.append(full_message)
    else:
        part1 = (
            overview_text + 
            req_missing_block + 
            "\n📋 *অনুপস্থিত তালিকা (পর্ব ১/২):*\n\n" + 
            area_blocks["Solid Production"] + 
            area_blocks["Softgel Production"] + 
            "_(বাকি অংশ পরবর্তী মেসেজে...)_"
        )
        part2 = (
            f"📋 *অনুপস্থিত তালিকা (পর্ব ২/২) — {formatted_date_bd}*\n" +
            "━━━━━━━━━━━━━━━━━━━━\n" +
            area_blocks["Packing Hall"] + 
            area_blocks["Overall"] + 
            footer_text
        )
        messages_to_send.extend([part1, part2])

    print(f"\nMessage prepared ({len(messages_to_send)} part(s)).")

    green_id = os.environ.get("GREEN_ID_INSTANCE", "").strip()
    green_token = os.environ.get("GREEN_API_TOKEN", "").strip()
    recipients_raw = os.environ.get("WA_RECIPIENTS", "").strip()

    if not green_id or not green_token or not recipients_raw:
        print("[WARN] Green API secrets not found in environment.")
        print("\n--- WHATSAPP MESSAGE PREVIEW ---\n" + messages_to_send[0] + "\n--------------------------------\n")
        return

    recipients = [r.strip() for r in re.split(r"[,;\n]+", recipients_raw) if r.strip()]
    api_url = f"https://api.green-api.com/waInstance{green_id}/sendMessage/{green_token}"

    for recipient in recipients:
        chat_id = recipient
        if "@" not in chat_id:
            clean_num = re.sub(r"[^0-9]", "", chat_id)
            if clean_num:
                chat_id = f"{clean_num}@c.us"

        print(f"[SENDING] Sending WhatsApp alert to {chat_id}...")
        for p_idx, part_msg in enumerate(messages_to_send):
            payload = {
                "chatId": chat_id,
                "message": part_msg
            }
            try:
                resp = requests.post(api_url, json=payload, timeout=25)
                if resp.status_code == 200:
                    print(f"  ✓ Part {p_idx+1} sent successfully.")
                else:
                    print(f"  ✗ Failed Part {p_idx+1}. HTTP {resp.status_code}: {resp.text}")
            except Exception as e:
                print(f"  ✗ Error sending WhatsApp message: {e}")

    print("=== Attendance & OT Process Finished ===")

if __name__ == "__main__":
    main()
