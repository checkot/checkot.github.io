import json
import requests
import os
import datetime
import time

# GitHub Secrets থেকে ডেটা নেওয়া
WA_RECIPIENTS = json.loads(os.environ.get("WA_RECIPIENTS", "[]"))
ID_INSTANCE = os.environ.get("GREEN_ID_INSTANCE")
API_TOKEN = os.environ.get("GREEN_API_TOKEN")

def get_today_date():
    # বাংলাদেশ সময় (UTC+6)
    bd_time = datetime.datetime.utcnow() + datetime.timedelta(hours=6)
    return bd_time.strftime("%d-%b-%Y").upper()

def send_whatsapp(phone, message):
    # Green API-এর সঠিক ফরম্যাটে নাম্বার কনভার্ট (স্পেস বা + চিহ্ন থাকলে সরাতে হবে)
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
    
    try:
        with open("data/latest.json", "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("latest.json not found!")
        return

    absentees = []

    # পাঞ্চ অ্যানালাইসিস
    for emp in data.get("employees", []):
        if not emp.get("valid"): 
            continue
            
        daily_records = emp.get("daily", [])
        found_today = False
        
        for record in daily_records:
            if record[0] == today:
                found_today = True
                in_punch = record[2] 
                duty = record[4]     
                
                # যদি IN পাঞ্চ না থাকে এবং ডিউটি থাকে
                if (in_punch == "" or in_punch == "-" or in_punch is None) and duty > 0:
                    absentees.append(f"• {emp['name']} ({emp['id']}) - {emp['area']}")
                break
        
        if not found_today:
             absentees.append(f"• {emp['name']} ({emp['id']}) - No Record")

    # মেসেজ তৈরি
    if absentees:
        total = len(absentees)
        msg = f"🚨 *Absentee Alert ({today})*\nমোট: {total} জন\n\nযাদের IN পাঞ্চ নেই:\n" + "\n".join(absentees)
    else:
        msg = f"✅ *Punch Report ({today})*\n\nসবাই পাঞ্চ করেছে! কোনো ইন-পাঞ্চ মিসিং নেই।"

    print(msg)

    # ৪ জনকে মেসেজ পাঠানো
    print("Sending WhatsApp messages via Green API...")
    for person in WA_RECIPIENTS:
        send_whatsapp(person["phone"], msg)
        time.sleep(3) # স্প্যাম ফিল্টার এড়াতে ৩ সেকেন্ড গ্যাপ

if __name__ == "__main__":
    main()
