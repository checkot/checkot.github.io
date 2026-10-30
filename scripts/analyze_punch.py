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
    bd_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=6)
    return bd_time.strftime("%d-%b-%Y").upper()

def load_area_employees():
    for p in [pathlib.Path("areas.json"), pathlib.Path("../areas.json")]:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
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
    
    # Timeout বাড়িয়ে ৬০ সেকেন্ড করা হয়েছে এবং ৩ বার চেষ্টা করবে
    for attempt in range(3):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=60)
            if response.status_code == 200:
                print(f"✅ Message sent to {clean_phone}")
                return
            else:
                print(f"❌ Failed to send to {clean_phone} (Server Response): {response.text}")
                return
        except Exception as e:
            print(f"⚠️ Attempt {attempt+1} failed to send to {clean_phone}: {e}")
            if attempt < 2:
                time.sleep(5) # ৫ সেকেন্ড অপেক্ষা করে আবার চেষ্টা করবে
            else:
                print(f"❌ Failed to send to {clean_phone} after 3 attempts.")

def main():
    today = get_today_date()
    
    # =======================================================
    # টেস্ট করার জন্য: আজকের ডেটা না থাকলে আপনি এখানে 30-OCT-2026 দিয়ে টেস্ট করতে পারেন
    # =======================================================
    # today = "30-OCT-2026"  <-- টেস্ট করার জন্য এই লাইনের '#' চিহ্নটি সরিয়ে দিন
    
    print(f"Checking data for date: {today}")
    
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
            
        emp_id = emp.get("id")
        if area_map and emp_id not in area_map:
            continue 

        daily_records = emp.get("daily", [])
        found_today = False
        
        for record in daily_records:
            if record[0] == today:
                found_today = True
                records_found_for_today += 1
                in_punch = record[2] 
                duty = record[4]     
                
                if (in_punch == "" or in_punch == "-" or in_punch is None) and duty > 0:
                    absentees.append(f"• {emp['name']} ({emp['id']})")
                break
        
        if not found_today:
             absentees.append(f"• {emp['name']} ({emp['id']}) - No Record")

    if records_found_for_today == 0:
        msg = f"⚠️ *Report Alert ({today})*\n\nআজকের ({today}) কোনো ডেটা এখনো Empress-এ যুক্ত হয়নি।"
        print(msg)
    elif absentees:
        total = len(absentees)
        display_list = absentees[:50]
        msg = f"🚨 *Absentee Alert ({today})*\nমোট: {total} জন\n\nযাদের IN পাঞ্চ নেই:\n" + "\n".join(display_list)
        
        if total > 50:
            msg += f"\n\n... এবং আরও {total - 50} জন।"
    else:
        msg = f"✅ *Punch Report ({today})*\n\nসবাই পাঞ্চ করেছে! কোনো ইন-পাঞ্চ মিসিং নেই।"

    print("Final Message Length:", len(msg))
    print(msg)

    print("Sending WhatsApp messages via Green API...")
    for person in WA_RECIPIENTS:
        send_whatsapp(person["phone"], msg)
        time.sleep(3)

if __name__ == "__main__":
    main()
