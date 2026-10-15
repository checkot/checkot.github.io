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
checkot.github.io/
├── index.html # Main app
├── manifest.json # PWA config
├── sw.js # Service worker
├── icon.png # App icon
├── og-image.png # Social share image
├── areas.json # 🏭 ID → Area mapping
├── team.json # ERP team info
├── notices.json # Notice board
└── pdfs/ # Monthly PDF reports
├── 2026-09/
│ ├── report1.pdf
│ └── report2.pdf
└── 2026-10/
└── ...


---

## 🔧 সেটআপ

### 1️⃣ Areas JSON ফরম্যাট

`areas.json`:
```json
{
  "areas": {
    "CF8355": "Solid Production",
    "RF20850": "Solid Production",
    "RF20178": "Softgel Production",
    "CF2697": "Softgel Production"
  }
}
⚠️ মনে রাখবেন: যে ID এখানে নেই, সেটা auto Packing Hall হবে।

2️⃣ Team JSON ফরম্যাট
team.json:

json
{
  "team": [
    {
      "name": "Md. Ariful Islam",
      "designation": "Coating PR",
      "id": "CF8355",
      "whatsapp": "8801845873227",
      "photo": "https://example.com/photo.jpg"
    }
  ]
}
3️⃣ Notices JSON ফরম্যাট
notices.json:

json
{
  "notices": [
    {
      "id": "n001",
      "title": "নতুন নোটিশ",
      "body": "বিস্তারিত...",
      "date": "2026-10-15",
      "priority": "high"
    }
  ]
}
priority: high | normal | low

4️⃣ PDF আপলোড
text
pdfs/YYYY-MM/
উদাহরণ: pdfs/2026-10/report.pdf

🚀 ডিপ্লয়
GitHub Pages-এ auto deploy:

bash
git add .
git commit -m "Update"
git push origin main
তারপর live: https://checkot.github.io

💡 ভবিষ্যতের আপডেট
নতুন employee যোগ হলে:
Solid/Softgel →

areas.json খুলুন

নতুন লাইন যোগ করুন: "CF12345": "Solid Production",

Commit + Push

App auto update নেবে

Packing Hall →

🎉 কিছুই করতে হবে না!

নতুন মাসের PDF:
pdfs/YYYY-MM/ ফোল্ডার বানান

PDF ফাইল আপলোড করুন

Commit + Push

📊 সিস্টেম ফ্লো
text
Employee ID সার্চ
      ↓
GitHub PDF ফোল্ডার লোড
      ↓
PDF স্ক্যান (parallel)
      ↓
ম্যাচ পাওয়া গেলে → PDF রেন্ডার
      ↓
Text Extract / OCR
      ↓
Category Detect (Grade/ID)
      ↓
ওভারটাইম হিসাব
      ↓
Display + Cache
🛠️ টেক স্ট্যাক
টুল	কাজ
HTML5 + CSS3	UI
Vanilla JavaScript	Logic (no framework)
PDF.js	PDF রেন্ডারিং
PDF-Lib	Single-page extract
Tesseract.js	OCR fallback
GitHub API	PDF ফাইল লিস্ট
Service Worker	Offline support
localStorage	Cache + history
📱 ব্রাউজার সাপোর্ট
ব্রাউজার	ভার্সন
Chrome (Android)	✅ Latest
Safari (iOS)	✅ 14+
Edge	✅ Latest
Firefox	✅ Latest
Samsung Internet	✅ Latest
🔒 প্রাইভেসি
❌ কোনো user data সার্ভারে যায় না

✅ সব calculation device-এ হয়

✅ Cache শুধু আপনার ব্রাউজারে

✅ GitHub-এ শুধু PDF রিপোর্ট

🐛 সমস্যা হলে
১. Report পাওয়া যাচ্ছে না
✅ Employee ID সঠিক কিনা চেক করুন (বড় হাতের অক্ষরে)

✅ PDF ফাইল pdfs/YYYY-MM/-এ আছে কিনা

✅ ইন্টারনেট connection চেক করুন

২. সবাই "Packing Hall" দেখাচ্ছে
✅ https://checkot.github.io/areas.json ব্রাউজারে খুলে দেখুন

✅ Console (F12)-এ [AreaMap] Loaded: XX IDs দেখুন

✅ Cache clear: localStorage.clear(); location.reload();

৩. লোড হচ্ছে না
✅ Hard refresh: Ctrl + Shift + R

✅ Browser cache clear করুন

✅ Service worker unregister করুন

৪. Category সনাক্ত হচ্ছে না
✅ PDF-এ Grade লেখা আছে কিনা চেক করুন

✅ M## JUNIOR OFFICER # ফরম্যাট হওয়া উচিত

✅ ERP Team-এর সাথে যোগাযোগ করুন

👨‍💻 ডেভেলপার
Md. Ariful Islam
Coating PR — RENATA PLC

📱 WhatsApp: +880 1845-873227

📞 সাপোর্ট
কোনো সমস্যা বা পরামর্শ থাকলে:

💬 WhatsApp: App Help

📧 In-app: ERP টিম পেজ

📜 লাইসেন্স
Internal use only — RENATA PLC
© 2026 RENATA PLC. All rights reserved.

📋 Changelog
v1.1.0 (2026-10-15)
✨ এরিয়া ফিল্টার (Solid / Softgel / Packing Hall)

🏭 areas.json থেকে auto area mapping

🎯 Packing Hall = auto default

🏷️ প্রতিটি employee-এ area badge

v1.0.0
🎉 প্রথম release

📄 PDF সার্চ + Calculator

🏆 Leaderboard

📢 নোটিশ বোর্ড

📞 ERP টিম পেজ

<div align="center">
Made with ❤️ for RENATA PLC

⭐ যদি কাজে লাগে, star দিন!

</div> ```
✅ রেডমি তৈরি হয়ে গেছে
এই README.md ফাইলটি GitHub-এ push করলে আপনার repo-র homepage-এ সুন্দরভাবে দেখাবে।

📌 এতে যা যা আছে:
সেকশন	বিষয়
✨ Features	সব ফিচারের লিস্ট
🏭 Area System	Solid/Softgel/Packing-এর নিয়ম
📁 File Structure	কোন ফাইল কোথায়
🔧 Setup	JSON ফরম্যাট উদাহরণ
🚀 Deploy	কীভাবে push করবেন
💡 Future Updates	নতুন ID যোগ করার নিয়ম
🐛 Troubleshooting	সাধারণ সমস্যা ও সমাধান
👨‍💻 Developer	আপনার তথ্য
📋 Changelog	ভার্সন হিস্ট্রি

