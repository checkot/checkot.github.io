```python
#!/usr/bin/env python3
"""
RPPF Attendance & Punch Analyzer (WhatsApp Alert Generator)
==========================================================
- Automatically detects employee punch status for today (Present vs Absent)
- 100% EXCLUDES previous-day night shift workers (Night Rest / Day off after night)
- Automatically EXCLUDES employees on Approved Long-Term Leave (Maternity Leave, Sick Leave, etc.)
- Groups absentees strictly by Area (Solid, Softgel, Packing, Executives) and Sub-sections
- Generates an executive "Manager View" overview with counts for Junior Officer, Contractual & Executive
- Protects against WhatsApp / Green API message character limits with smart chunking
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

    print(f"=== RPPF Attendance Analysis ===")
    print(f"Current BD Time: {now_bd.strftime('%Y-%m-%d %I:%M %p')}")
    print(f"Target Date: {today_emp_format} ({today_iso})")
    print(f"Yesterday: {yesterday_emp_format} ({yesterday_iso})")

    # 1. Load areas.json
    areas_data = load_json_file("areas.json", {})
    area_map = areas_data.get("areas", {})
    area_details = areas_data.get("details", {})
    area_subsections = areas_data.get("subsections", {})

    if not area_map:
        print("[ERROR] areas.json is empty or missing! Cannot map employees to production areas.")
        sys.exit(0)

    # 2. Load approved long-term leaves (from absent.json or leaves.json)
    absent_data = load_json_file("absent.json", {})
    long_term_leaves = absent_data.get("longTermLeaves", [])
    
    # Also support standalone leaves.json if present
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

    # Map by employee ID
    emp_records = {normalize_id(e.get("id")): e for e in employees_list if e.get("id")}
    print(f"Loaded {len(emp_records)} employee records from current month data.")

    # If today is 1st day of month, load previous month data to check yesterday's night shifts
    prev_month_records = {}
    if now_bd.day == 1 and yesterday_month_str != current_month_str:
        p_data = load_json_file(f"data/{yesterday_month_str}.json", {})
        p_list = p_data.get("employees", []) if isinstance(p_data, dict) else (p_data if isinstance(p_data, list) else [])
        prev_month_records = {normalize_id(e.get("id")): e for e in p_list if e.get("id")}
        print(f"Loaded {len(prev_month_records)} records from previous month ({yesterday_month_str}) for night rest check.")

    # Target Allowed Sections in RPPF
    allowed_sections = ["Solid Production", "Softgel Production", "Packing Hall", "Overall"]

    # Tracking sets and structures
    stats = {
        "total_listed": 0,
        "present": 0,
        "absent": 0,
        "night_rest": 0,
        "approved_leave": 0,
        "by_category": {
            "JO": {"total": 0, "present": 0, "absent": 0},
            "CON": {"total": 0, "present": 0, "absent": 0},
            "EXEC": {"total": 0, "present": 0, "absent": 0},
            "CAS": {"total": 0, "present": 0, "absent": 0}
        }
    }

    # Grouped absentees: area -> subsection -> list of employee info
    absent_by_area_sub = {
        "Solid Production": {},
        "Softgel Production": {},
        "Packing Hall": {},
        "Overall": {}
    }

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

        # Update category if grade provides better info
        if emp_type == "CON" and "JUNIOR OFFICER" in emp_grade.upper():
            emp_type = "JO"

        stats["total_listed"] += 1
        stats["by_category"][emp_type]["total"] += 1

        # Check 1: Approved Long-Term Leave (Maternity Leave, Long-Term Medical, etc.)
        if emp_id in active_leaves_map:
            stats["approved_leave"] += 1
            stats["by_category"][emp_type]["present"] += 1  # Not counted as unauthorized absent
            leave_info = active_leaves_map[emp_id]
            print(f"[EXEMPT - LEAVE] {emp_id} ({emp_name}): {leave_info.get('type', 'Approved Leave')}")
            continue

        # Check today's daily log
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

        # If yesterday not found in current daily log (e.g. Day 1 of month), check previous month data
        if yesterday_row is None and prev_month_records.get(emp_id):
            p_daily = prev_month_records[emp_id].get("daily", [])
            for r in p_daily:
                if str(r[0]).strip().upper() == yesterday_emp_format:
                    yesterday_row = r
                    break

        # Check Today's Punch Activity
        is_present = False
        today_in = ""
        today_out = ""

        if today_row:
            today_in = str(today_row[2]).strip() if len(today_row) > 2 else ""
            today_out = str(today_row[3]).strip() if len(today_row) > 3 else ""
            reg_duty = float(today_row[4]) if len(today_row) > 4 and str(today_row[4]).replace('.','',1).isdigit() else 0
            reg_ot = float(today_row[5]) if len(today_row) > 5 and str(today_row[5]).replace('.','',1).isdigit() else 0
            
            # Present if punch in or punch out or duty logged
            if (not is_punch_missing(today_in)) or (not is_punch_missing(today_out)) or (reg_duty > 0) or (reg_ot > 0):
                is_present = True

        if is_present:
            stats["present"] += 1
            stats["by_category"][emp_type]["present"] += 1
            continue

        # Check 2: Night Shift Exemption (Previous day was Night Shift OR today has morning Night Exit punch)
        is_night_exempt = False

        # Condition A: Yesterday was Night Shift (isNight flag or shift string or Night Allowance)
        if yesterday_row:
            is_night_flag = int(yesterday_row[10]) == 1 if len(yesterday_row) > 10 and str(yesterday_row[10]).isdigit() else False
            shift_str = str(yesterday_row[11]).strip().upper() if len(yesterday_row) > 11 else ""
            if is_night_flag or "NIGHT" in shift_str:
                is_night_exempt = True
                print(f"[EXEMPT - NIGHT REST] {emp_id} ({emp_name}) worked Night Shift yesterday ({yesterday_emp_format}).")

        # Condition B: Checkout this morning from night shift (e.g. Out punch exists between 04:00 - 09:30 AM without In punch)
        if not is_night_exempt and today_row and not is_punch_missing(today_out) and is_punch_missing(today_in):
            is_night_exempt = True
            print(f"[EXEMPT - NIGHT EXIT] {emp_id} ({emp_name}) clocked out this morning ({today_out}).")

        if is_night_exempt:
            stats["night_rest"] += 1
            stats["by_category"][emp_type]["present"] += 1  # Not unauthorized absent
            continue

        # Employee is ABSENT
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

    print(f"\n--- Summary ---")
    print(f"Total Listed: {stats['total_listed']}")
    print(f"Present: {stats['present']}")
    print(f"Absent: {stats['absent']}")
    print(f"Night Rest Exempt: {stats['night_rest']}")
    print(f"Approved Leave Exempt: {stats['approved_leave']}")

    # Build Organized WhatsApp Message (Manager View & Area-Subsection Breakdown)
    formatted_date_bd = now_bd.strftime("%d-%b-%Y")
    formatted_time_bd = now_bd.strftime("%I:%M %p")

    # Header & Manager Overview Block
    overview_text = (
        f"📊 *RPPF DAILY ATTENDANCE & ABSENT REPORT*\n"
        f"📅 *তারিখ:* {formatted_date_bd} | *সময়:* {formatted_time_bd}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👔 *MANAGER OVERVIEW (ম্যানেজার সামারি)*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👥 মোট সক্রিয় কর্মী: {stats['total_listed']} জন\n"
        f"✅ উপস্থিত (Present): {stats['present']} জন\n"
        f"❌ অনুপস্থিত (Absent): *{stats['absent']} জন*\n"
        f"🌙 নাইট রেস্ট (Night Rest): {stats['night_rest']} জন (বাদ)\n"
        f"🏥 মাতৃত্ব/অনুমোদিত ছুটি: {stats['approved_leave']} জন (বাদ)\n\n"
        f"📌 *ক্যাটাগরি ভিত্তিক ওভারভিউ:*\n"
        f"• *Junior Officer (JO):* উপস্থিত {stats['by_category']['JO']['present']} | অনুপস্থিত *{stats['by_category']['JO']['absent']}*\n"
        f"• *Contractual (CF):* উপস্থিত {stats['by_category']['CON']['present']} | অনুপস্থিত *{stats['by_category']['CON']['absent']}*\n"
        f"• *Executive / Staff:* উপস্থিত {stats['by_category']['EXEC']['present']} | অনুপস্থিত *{stats['by_category']['EXEC']['absent']}*\n"
    )

    if stats['by_category']['CAS']['total'] > 0:
        overview_text += f"• *Casual:* উপস্থিত {stats['by_category']['CAS']['present']} | অনুপস্থিত *{stats['by_category']['CAS']['absent']}*\n"

    overview_text += f"━━━━━━━━━━━━━━━━━━━━\n"

    # Area & Subsection Breakdown Blocks
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
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"💡 *ফিল্টারিং রুলস:* আগের দিন নাইট ডিউটি করা ও ম্যাটারনিটি/অনুমোদিত ছুটিতে থাকা কর্মীরা এই অনুপস্থিত তালিকা থেকে সম্পূর্ণ মুক্ত।\n"
        f"🤖 _RPPF Automated Production Attendance Engine_"
    )

    # Check Message Size & Smart Chunking for WhatsApp Limits (Max 3,500 chars per message)
    full_message = overview_text + "\n📋 *সেকশন ও সাব-সেকশন ভিত্তিক অনুপস্থিত তালিকা:*\n\n" + "".join(area_blocks.values()) + footer_text

    messages_to_send = []
    if len(full_message) <= 3400:
        messages_to_send.append(full_message)
    else:
        # Split into 2 parts:
        # Part 1: Overview + Solid & Softgel
        part1 = (
            overview_text + 
            "\n📋 *অনুপস্থিত তালিকা (পর্ব ১/২):*\n\n" + 
            area_blocks["Solid Production"] + 
            area_blocks["Softgel Production"] + 
            "_(বাকি অংশ প্যাকিং ও এক্সিকিউটিভ পরবর্তী মেসেজে...)_"
        )
        # Part 2: Packing Hall + Executives + Footer
        part2 = (
            f"📋 *অনুপস্থিত তালিকা (পর্ব ২/২) — {formatted_date_bd}*\n" +
            f"━━━━━━━━━━━━━━━━━━━━\n" +
            area_blocks["Packing Hall"] + 
            area_blocks["Overall"] + 
            footer_text
        )
        messages_to_send.extend([part1, part2])

    print(f"\nMessage prepared ({len(messages_to_send)} part(s)).")
    print("--- Message Preview ---")
    print(messages_to_send[0][:500] + "...\n")

    # Send WhatsApp Message via Green API
    green_id = os.environ.get("GREEN_ID_INSTANCE", "").strip()
    green_token = os.environ.get("GREEN_API_TOKEN", "").strip()
    recipients_raw = os.environ.get("WA_RECIPIENTS", "").strip()

    if not green_id or not green_token or not recipients_raw:
        print("[WARN] Green API secrets (GREEN_ID_INSTANCE, GREEN_API_TOKEN, WA_RECIPIENTS) not found in environment.")
        print("[INFO] Skipping network send. (Message preview generated successfully).")
        return

    # Parse recipients (can be comma, semicolon or newline separated)
    recipients = [r.strip() for r in re.split(r"[,;\n]+", recipients_raw) if r.strip()]
    api_url = f"https://api.green-api.com/waInstance{green_id}/sendMessage/{green_token}"

    for recipient in recipients:
        chat_id = recipient
        # If it's a regular phone number without suffix, format as @c.us
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
                    print(f"  ✓ Part {p_idx+1} sent successfully. Response: {resp.text}")
                else:
                    print(f"  ✗ Failed to send Part {p_idx+1}. HTTP {resp.status_code}: {resp.text}")
            except Exception as e:
                print(f"  ✗ Error sending WhatsApp message: {e}")

    print("=== Attendance Alert Process Finished ===")

if __name__ == "__main__":
    main()
```
