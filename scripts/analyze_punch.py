import json
import requests
import os
import datetime
import time
import pathlib

# GitHub Secrets থেকে ডেটা নেওয়া
WA_RECIPIENTS = json.loads(os.environ.get("WA_RECIPIENTS", "[]"))
ID_INSTANCE = os.environ.get("GREEN_ID_INSTANCE")
API_TOKEN = os.environ.get("GREEN_API_TOKEN")

def get_today_date():
    # বাংলাদেশ সময় (UTC+6)
    bd_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=6)
    return bd_time.strftime("%d-%b-%Y").upper()

def load_area_employees():
    """areas.json থেকে শুধুমাত্র কর্মীদের আইডি লিস্ট বের করা"""
    for p in [pathlib.Path("areas.json"), pathlib.Path("../areas.json")]:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # areas.json-এর ভেতরে "areas" কী-এর অধীনে ডেটা থাকে
                    return data.get("areas", {})
            except Exception as e:
                print(f"[WARN] Could not parse {p}: {e}")
    return {}

def send_whatsapp(phone, message):
    clean_phone = phone.replace("+", "").replace(" ", "").strip()
    chat_id = f"{clean_phone}@c.us"
    
    url = f"https://api.green-api.com/waInstance{ID_INSTANCE}/sendMessage/{API_TOKEN}"
    payload = {
        "chatId": chat_id,
        "message": message
    }
    headers = {'Content-Type': 'application/json'}
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code == 200:
            print(f"✅ Message sent to {clean_phone}")
        else:
            print(f"❌ Failed to send to {clean_phone}: {response.text}")
    except Exception as e:
        print(f"❌ Error sending to {clean_phone}: {e}")

def main():
    today = get_today_date()
    print(f"Checking data for date: {today}")
    
    # areas.json লোড করা
    area_map = load_area_employees()
    print(f"Loaded {len(area_map)} employees from areas.json")
    
    if not area_map:
        print("[WARN] areas.json not found or empty. All employees will be checked.")

    try:
        with open("data/latest.json", "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("latest.json not found!")
        return

    absentees = []
    records_found_for_today = 0

    for emp in data.get("employees", []):
        if not emp.get("valid"): 
            continue
            
        # ==========================================
        # এখানে ফিল্টার করা হচ্ছে: যদি কর্মী areas.json-এ না থাকে, তবে বাদ যাবে
        # ==========================================
        emp_id = emp.get("id")
        if area_map and emp_id not in area_map:
            continue 
        # ==========================================

        daily_records = emp.get("daily", [])
        found_today = False
        
        for record in daily_records:
            if record[0] == today:
                found_today = True
                records_found_for_today += 1
                in_punch = record[2] 
                duty = record[4]     
                
                # যদি IN পাঞ্চ না থাকে এবং ডিউটি থাকে
                if (in_punch == "" or in_punch == "-" or in_punch is None) and duty > 0:
                    absentees.append(f"• {emp['name']} ({emp['id']})")
                break
        
        # যদি আজকের রেকর্ড না থাকে (কিন্তু areas.json-এ আছে)
        if not found_today:
             absentees.append(f"• {emp['name']} ({emp['id']}) - No Record")

    # মেসেজ তৈরি
    if records_found_for_today == 0:
        msg = f"⚠️ *Report Alert ({today})*\n\nআজকের ({today}) কোনো ডেটা এখনো Empress-এ যুক্ত হয়নি।"
        print(msg)
    elif absentees:
        total = len(absentees)
        # WhatsApp মেসেজ লিমিট ঠিক রাখতে সর্বোচ্চ ৫০ জনের নাম দেখাবে
        display_list = absentees[:50]
        msg = f"🚨 *Absentee Alert ({today})*\nমোট: {total} জন\n\nযাদের IN পাঞ্চ নেই:\n" + "\n".join(display_list)
        
        if total > 50:
            msg += f"\n\n... এবং আরও {total - 50} জন।"
    else:
        msg = f"✅ *Punch Report ({today})*\n\nসবাই পাঞ্চ করেছে! কোনো ইন-পাঞ্চ মিসিং নেই।"

    print("Final Message Length:", len(msg))
    print(msg)

    # মেসেজ পাঠানো
    print("Sending WhatsApp messages via Green API...")
    for person in WA_RECIPIENTS:
        send_whatsapp(person["phone"], msg)
        time.sleep(3)

if __name__ == "__main__":
    main()
