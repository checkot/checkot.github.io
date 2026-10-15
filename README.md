#  RENATA PLC — Overtime Report only for RPPF Production employees so far

> Employee Overtime Report Search, Calculator & Leaderboard — একটি Progressive Web App (PWA)

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![PWA](https://img.shields.io/badge/PWA-ready-success)
![License](https://img.shields.io/badge/license-Internal-red)

---

## 📱 Live App

**🌐 URL:** [https://checkot.github.io](https://checkot.github.io)

**📲 Install:** মোবাইল ব্রাউজারে খুলে "Add to Home Screen" দিন

---

## ✨ Features

### 🔍 রিপোর্ট সার্চ
- Employee ID দিয়ে মাসিক ওভারটাইম রিপোর্ট খুঁজুন
- GitHub থেকে সরাসরি PDF লোড
- শুধু প্রয়োজনীয় পেজ দেখায় (দ্রুত লোড)

###  ওভারটাইম ক্যালকুলেটর
- **CF** (Contractual) — ৳38/hr, নাইট ৳300
- **JO** (Junior Officer) — ৳40/hr, নাইট ৳400
- **JO_B** (Jr. Officer A/B) — ৳45/hr, নাইট ৳500
- Auto category detection (Grade/ID থেকে)

### 🏆 Leaderboard (সেরা কে এই মাসে?)
- **Duty Hours** — সর্বোচ্চ ডিউটি করা
- **OT Hours** — সর্বোচ্চ ওভারটাইম করা
- **Total Earning** — সর্বোচ্চ টাকা আয়
- 🏭 **এরিয়া ফিল্টার** — Solid / Softgel / Packing Hall

### 📊 অন্যান্য
- 🤝 অন্য সহকর্মীর সাথে তুলনা
- 📅 হলিডে/DO/নাইট ডিউটির লিস্ট
- 📢 নোটিশ বোর্ড (auto-refresh)
- 📞 ERP টিম (WhatsApp)
- 🕓 সার্চ হিস্ট্রি

---

## 🏭 এরিয়া সিস্টেম

App তিনটি এরিয়া সাপোর্ট করে:

| এরিয়া | কীভাবে নির্ধারিত হয় |
|--------|---------------------|
| **Solid Production** | `areas.json` থেকে |
| **Softgel Production** | `areas.json` থেকে |
| **Packing Hall** | **Auto (default)** — যারা JSON-এ নেই |

### 📝 নিয়ম

- ✅ **Solid / Softgel**-এর নতুন employee আসলে → `areas.json`-এ যোগ করুন
- ✅ **Packing Hall**-এর নতুন employee আসলে → **কিছু করতে হবে না** (auto ধরা পড়বে)

---

## 📁 ফাইল স্ট্রাকচার

