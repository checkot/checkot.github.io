# DATA_GUIDE — ডেটা কীভাবে সাজানো, আর নিয়ম বদলালে কী করতে হবে
(For any AI or developer opening this repo: read this file first.)

## 1. মূল ধারণা: দুই স্তর
| স্তর | ফাইল | কী আছে | কে বদলায় |
|---|---|---|---|
| **Raw (মূল ডেটা)** | `data/YYYY-MM.raw.json` | Empress Excel-এর প্রতিটি শিটের প্রতিটি সারির প্রতিটি ঘর, হুবহু। কোনো নিয়ম প্রয়োগ হয়নি। | শুধু `to_json.py` (Excel প্রসেসের সময়) |
| **Derived (হিসাব করা)** | `data/YYYY-MM.json`, `data/latest.json` | অ্যাপ যা দেখায়: নাইট, OT দিন, ফ্ল্যাগ, টাকা ইত্যাদি | `to_json.py` / `recompute_from_raw.py` |

Raw থাকলে যেকোনো নিয়ম, রেট, এলাকা বা ছুটি বদলে **Excel আবার আপলোড না করেই** Derived নতুন করে বানানো যায়।

```
Empress Excel ──► raw/*.xlsx ──► to_json.py ──► data/YYYY-MM.json  (অ্যাপ এটা পড়ে)
                                     └────────► data/YYYY-MM.raw.json (লসলেস কপি)
data/YYYY-MM.raw.json ──► scripts/recompute_from_raw.py ──► data/YYYY-MM.json   (Excel ছাড়াই)
```
`raw/` ফোল্ডারের xlsx প্রসেসের পর মুছে যায় (.gitignore-এও আছে)। `data/*.raw.json` সেই কপি যা থেকে যায়।

## 2. Raw ফাইলের গঠন
```
{ "schema":1, "month":"2026-10", "parserVersion":"...", "archivedAt":"...", "about":"...",
  "files":[ { "name":"<excel ফাইলের নাম>",
              "sheets":[ { "name":"Work Log", "rows":[ [ঘর0, ঘর1, ...], ... ] },
                         { "name":"Summary",  "rows":[ ... ] } ] } ] }
```
- প্রতি সারি একটা অ্যারে, ফাইলে এক লাইনে এক সারি। খালি সারি `[]`, যাতে সারির অবস্থান না সরে।
- তারিখ/সময়ের ট্যাগ: `@dt:` datetime, `@d:` date, `@t:` time, `@td:` duration (সেকেন্ড)।
- Work Log শিটের গঠন: কর্মীর হেডার সারি (`RF20852 নাম পদবি, ...`), তারপর প্রতিদিনের সারি (Date, Day, Shift, In, Out, Duty, OT, Day Off Duty/OT, Holiday Duty/OT, Night), তারপর `Total` সারি।
- কলামের অবস্থান ফিক্সড ধরা হয় না। `to_json.py → detect_work_log_columns` হেডার সারি দেখে বের করে।

## 3. Derived JSON-এর গঠন (`data/YYYY-MM.json`)
`{ month, updatedAt, employees:[...] }`। প্রতিটি employee-তে:
- পরিচয়: `id, name, grade, kind, category, area, sub, isRppf, valid`
- যোগফল: `totalDuty, otHours, holidayCount, nightCount, regularDaysCount, plainDaysCount`
- তালিকা:  (অ্যাবসেন্ট ডেটা স্টোর হয় না, রানটাইমে  ও -এর  থেকে লাইভ হিসাব হয়)`holidayDays[], nightDays[], punchProblems[], requisitionProblems[], nightSuspects[], generalAbsentDays[]`
- টাকা: `otAmount, holidayAmount, nightAmount, totalEarned`
- `daily[]`: প্রতিদিনের সারি, ক্রম:
  `[0 date, 1 day, 2 in, 3 out, 4 regDuty, 5 regOT, 6 doDuty, 7 doOT, 8 holDuty, 9 holOT, 10 nightFlag(0/1), 11 shift]`

## 4. নিয়ম বদলাতে চাইলে (শর্টকাট)
| কী বদলাবেন | কোথায় | তারপর |
|---|---|---|
| নাইটের নিয়ম | `scripts/to_json.py`: `NIGHT_YES_VALUES`, `is_night = ...` (আর `admin-tools.js` একই) | recompute |
| নাইট-সন্দেহের সীমা (১৫ ঘণ্টা) | `NIGHT_SUSPECT_HOURS` | recompute |
| OT রিকুইজিশন নিয়ম | `to_json.py` "COMPREHENSIVE REQUISITION AUDIT" | recompute |
| রেট (OT, নাইট, হলিডে) | `areas.json → rateTable`, পদবির রেট `designationRates` | recompute |
| কর্মীর এলাকা/সেকশন | `areas.json → areas, details` | recompute |
| সরকারি/কাস্টম ছুটি | `areas.json → holidays` (custom / cancelled) | recompute |
| ক্যাটাগরি শনাক্ত (JO, CF…) | `to_json.py → detect_category` | recompute |
| নতুন কিছু গুনতে চাই (নতুন ফিল্ড) | `parse_workbook` + `finalize_excel_employee`-এ যোগ | recompute, তারপর `js/` এ দেখানো |

**Recompute চালানো:**
```bash
python scripts/recompute_from_raw.py 2026-10          # এক মাস
python scripts/recompute_from_raw.py --all            # সব মাস
git add data/*.json && git commit -m "Recompute" && git push
```
এটা `to_json.py`-র হুবহু একই কোড চালায় (মেমরিতে workbook বানিয়ে), তাই নিয়ম আলাদা দুই জায়গায় লিখতে হয় না।
`latest.json` শুধু সবচেয়ে নতুন মাসের recompute-এ বদলায়।

## 5. জানা সীমাবদ্ধতা
- `data/*.raw.json` শুধু সেই মাসের জন্য আছে, যে মাসের Excel নতুন `to_json.py` দিয়ে একবার প্রসেস হয়েছে। পুরনো মাসের জন্য Excel একবার আপলোড করতে হবে। এরপর আর লাগবে না।
- অ্যাডমিন প্যানেলের `deploy.zip` দিয়ে `.github/` ফোল্ডারের ফাইল বদলানো যায় না। GitHub ওয়েবসাইটে সরাসরি এডিট করতে হয়।
- অ্যাপের ব্রাউজার-সাইড কিছু নিয়ম (`js/pages/report.js`, `js/admin/admin-core.js`) `daily[]` থেকে আবার হিসাব করে। সেগুলো বদলালে recompute লাগে না, শুধু সাইট ডিপ্লয় লাগে।
- একই নিয়ম Python-এ (`to_json.py`) আর JS-এ (`admin-tools.js`, `report.js`) আলাদা কপি আছে। বদলালে দুই জায়গাতেই বদলান। নিয়মের পূর্ণ তালিকা লজিক চার্টে আছে।
