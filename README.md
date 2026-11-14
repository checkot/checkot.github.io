# RPPF — Overtime Report & Calculator

> **Renata PLC Production Factory (RPPF)** কর্মীদের জন্য Overtime রিপোর্ট দেখা ও ক্যালকুলেশনের Progressive Web App (PWA)।

🔗 **Live:** [checkot.github.io](https://checkot.github.io)

---

## ✨ Features

| Feature | Description |
|---|---|
| **Overtime Search** | Employee ID দিয়ে যেকোনো মাসের overtime রিপোর্ট দেখুন |
| **My Profile (Me)** | নিজের বছর/মাসভিত্তিক OT, আয়, রাত ও ছুটির ডিউটি, Absent/Long leave, গড় In/Out, "Check before payroll" (requisition/night/punch সমস্যা + ERP Team-কে WhatsApp), streak, section-average তুলনা ও শেয়ার ইমেজ — এক পেজে |
| **Auto Calculation** | OT Allowance, Holiday Allowance, Night Allowance এবং Regular Duty — সব স্বয়ংক্রিয়ভাবে হিসাব হয় |
| **Monthly Leaderboard** | Solid, Softgel ও Packing Hall — সেকশনওয়ারি র‌্যাংকিং ও Top Performers |
| **VS (1v1) Compare** | দুইজন কর্মীর overtime পাশাপাশি তুলনা (মোবাইলে **More** মেনু থেকে, `#/vs`) |
| **Payslip Generator** | মাসিক salary + overtime দিয়ে মোট প্রাপ্তি হিসাব ও JPG ডাউনলোড |
| **Punch Problem Detection** | Missing In/Out punch স্বয়ংক্রিয়ভাবে শনাক্ত হয় |
| **In-Charge Mode** | PIN-ভেরিফায়েড ড্যাশবোর্ড — section strength, absent list, action center, risk watchlist |
| **Admin Category System** | কর্মীদের কাস্টম ক্যাটাগরি ও এরিয়া assign করার সুবিধা |
| **Notices Board** | ফ্যাক্টরির গুরুত্বপূর্ণ নোটিশ ও আপডেট |
| **ERP Team Contact** | WhatsApp-এ এক ট্যাপে ERP টিমকে মেসেজ |
| **Dark/Light Theme** | সিস্টেম প্রেফারেন্স বা ম্যানুয়াল থিম সুইচ |
| **PWA Install** | ফোনের হোমস্ক্রিনে অ্যাপের মতো ইনস্টল করা যায় |
| **Firebase Realtime** | Live presence board, telemetry ও server sync |
| **Maternity Leave Tracker** | অনুমোদিত ৬-মাসের ম্যাটার্নিটি লিভ ট্র্যাকিং |

> **মোবাইল bottom nav:** `Home | Report | Me | Rank | More` (Me = `#/profile`)। ডেস্কটপ top-nav-এ "My Profile" Report-এর পরে।

---

## 🏗️ Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (No framework)
- **Styling:** Custom CSS tokens, component-based architecture
- **Backend/Data:** Firebase Realtime Database
- **Hosting:** GitHub Pages
- **PWA:** Service Worker + Web App Manifest
- **Font:** [Hind Siliguri](https://fonts.google.com/specimen/Hind+Siliguri) (Bangla + Latin)

---

## 📁 Project Structure

```
checkot.github.io/
├── index.html              # Main SPA entry point (all pages)
├── manifest.json           # PWA manifest
├── icon.png                # App icon (192x192 / 512x512)
├── og-image.png            # Open Graph social preview image
│
├── css/
│   ├── tokens.css          # Design tokens (colors, spacing, typography)
│   ├── base.css            # Reset & base styles
│   ├── components.css      # Reusable UI components
│   ├── nav.css             # Top nav & bottom nav styles
│   ├── pages.css           # Page-specific layouts
│   ├── manager-ux.css      # In-Charge / Manager mode styles
│   ├── rank-details.css    # Rank detail modal styles
│   ├── profile.css         # My Profile (Me) page styles
│   ├── assessment.css      # Assessment page styles
│   ├── fit.css             # Text auto-fit styles
│   ├── modern-top.css      # Modern top bar redesign
│   └── rank-loader.css     # Rank loading animation styles
│
├── js/
│   ├── app-main.js         # App initialization & boot logic
│   ├── core/
│   │   ├── config.js       # Firebase config, API endpoints, rate constants
│   │   ├── state.js        # Global app state management
│   │   ├── storage.js      # LocalStorage helpers
│   │   ├── utils.js        # Utility functions
│   │   ├── access-crypto.js    # Encryption & PIN hashing
│   │   └── access-control.js   # Role-based access control
│   ├── calculations/
│   │   ├── rates.js        # OT, Holiday, Night rate calculation engine
│   │   ├── ranking.js      # Leaderboard ranking algorithm
│   │   ├── early-exit.js   # Early-exit detection
│   │   ├── attendance.js   # computeEmpMonthRows — shared Absent/Leave/Off logic (Report + Profile)
│   │   └── profile.js      # Pure per-month/year aggregation for My Profile (no DOM, Node-testable)
│   ├── components/
│   │   ├── router.js       # SPA page routing
│   │   ├── loader.js       # Loading animation (calculator UI)
│   │   ├── rank-loader.js  # Rank loading animation
│   │   ├── rank-details.js # Employee rank detail modal
│   │   ├── pwa-install.js  # PWA install prompt handler
│   │   ├── telemetry.js    # Usage analytics via Firebase
│   │   └── presence-board.js # Live active user presence
│   ├── pages/
│   │   ├── search.js       # Home / search page
│   │   ├── report.js       # Detailed report & payslip
│   │   ├── leaderboard.js  # Monthly leaderboard & ranking
│   │   ├── vs.js           # 1v1 comparison page
│   │   ├── profile.js      # My Profile page (render)
│   │   ├── profile-data.js # Profile data loader: per-employee file, else progressive month files
│   │   ├── history.js      # Search history page
│   │   ├── settings.js     # App settings page
│   │   ├── notices.js      # Factory notices board
│   │   ├── team.js         # ERP team contact page
│   │   ├── assessment.js   # Employee assessment page
│   │   └── more.js         # More options page
│   └── patches/
│       └── manager-ux.js   # Manager/In-Charge UX enhancements
├── data/
│   ├── YYYY-MM.json        # Monthly dataset (PR); data/qa/ for QA
│   └── emp/<PR|QA>/<ID>.json   # Per-employee history (all months) — generated, see below
│
├── scripts/
│   ├── to_json.py          # Excel -> data/*.json (also refreshes data/emp)
│   ├── build_emp_history.py    # (Re)build every data/emp file from data/*.json
│   └── recompute_from_raw.py   # Recompute from raw archive (also refreshes data/emp)
│
├── tests/                  # Node + Playwright checks (see PROFILE_NOTES.md)
├── docs/screens/           # Verification screenshots
├── PROFILE_NOTES.md        # My Profile: decisions, formulas, data-size numbers, skipped items
└── README.md
```

### My Profile — data loading
- **Option A (default):** one small file `data/emp/<DEPT>/<ID>.json` (avg ≈ 21 KB raw / ≈ 4 KB gzip) with that employee's records for all months.
- **Option B (fallback if the file 404s):** progressive load of full month files, newest first, with a progress bar; only a compact per-employee extract is cached in `localStorage`.
- Workflows (`empress.yml`, `recompute-from-raw.yml`, `manual-excel.yml`) regenerate `data/emp` and commit it with the monthly data. To rebuild everything by hand: `python3 scripts/build_emp_history.py`.

---

## 💰 OT Rate Chart

| Grade | OT Rate (per hour) | Night Allowance (per night) |
|---|---|---|
| **CF** (Contractual) | ৳38 | ৳300 |
| **JO** (Junior Officer) | ৳40 | ৳400 |
| **JO A/B** | ৳45 | ৳500 |

---

## 🚀 Getting Started

এটি একটি static site — কোনো build step নেই:

1. **Clone:**
   ```bash
   git clone https://github.com/checkot/checkot.github.io.git
   cd checkot.github.io
   ```

2. **Run locally:**
   যেকোনো static server দিয়ে চালান:
   ```bash
   # Python
   python3 -m http.server 8000

   # Node.js
   npx serve .
   ```

3. **Open:** [http://localhost:8000](http://localhost:8000)

---

## 📱 Pages / Sections

| Page | Route | Description |
|---|---|---|
| **Home** | `search` | ID দিয়ে overtime সার্চ, recent searches, quick actions |
| **Rank** | `leaderboard` | মাসিক র‌্যাংকিং — section ও category wise filter |
| **Report** | `report` | বিস্তারিত overtime breakdown, payslip তৈরি, JPG download |
| **VS (1v1)** | `vs` | দুইজন কর্মীর তুলনা |
| **Notices** | `notices` | ফ্যাক্টরির নোটিশ ও আপডেট |
| **History** | `history` | পূর্বের সার্চ হিস্টরি |
| **ERP Team** | `team` | ERP সাপোর্ট টিমের কন্টাক্ট |
| **Settings** | `settings` | থিম, ভাষা, ক্যাশ ও অন্যান্য সেটিংস |
| **More** | `more` | অতিরিক্ত অপশনসমূহ |

---

## 🔐 Access Modes

| Mode | Access | Features |
|---|---|---|
| **Normal** | সবার জন্য উন্মুক্ত | নিজের overtime দেখা, compare, payslip |
| **In-Charge** | PIN দিয়ে ভেরিফাইড | Section overview, absent list, action center, risk watchlist, category toppers |
| **Admin** | Admin password | Employee category assign, server sync, bulk absent management |

---

## 🤝 Contributing

এটি **Renata PLC** এর অভ্যন্তরীণ production factory-র জন্য তৈরি। Contributions বা suggestions থাকলে ERP Team-এ যোগাযোগ করুন।

---

## 📄 License

Internal use only — Renata PLC, RPPF Production Division.

---

<p align="center">
  <strong>Built with ❤️ for RPPF Production Workers</strong><br>
  <sub>Developed & maintained by <a href="https://github.com/checkot">Checkot</a></sub>
</p>
