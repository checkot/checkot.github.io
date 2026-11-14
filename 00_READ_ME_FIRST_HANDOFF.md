# NEXT AI INSTRUCTIONS (পরবর্তী AI-এর জন্য নির্দেশনা)

- **তুমি একটি অসম্পূর্ণ কাজ গ্রহণ করছ। আগের AI-এর লিমিট শেষ হয়ে গেছে।**
- **কাজের লক্ষ্য (এক অনুচ্ছেদে):** Renata PLC (RPPF)-এর Overtime & Allowance ক্যালকুলেটর PWA (`checkot.github.io`)-তে একটি নতুন মোবাইল-ফার্স্ট **"Employee Profile" ("Me")** পেজ (`#/profile`) যুক্ত করা এবং মোবাইল বটম নেভিগেশন বার ও ডেক্সটপ টপ নেভিগেশন সংস্কার করা (`Home | Report | Me | Rank | More`, এবং `1V1 (VS)` পেজটিকে `More` ড্রয়ারে সরিয়ে নেওয়া)। এই পেজে কর্মীর সেভ করা আইডি (`getPreferredId()`) অনুযায়ী চলতি মাস, গত মাস, বা পুরো বছরের (২০২৬) সামগ্রিক ওভারটাইম ঘণ্টা, আয় (টাকা হাইড করার বাটনসহ), উপস্থিতি ও অনুপস্থিতি/ম্যাটার্নিটি লিভ (Report পেজের সাথে ১০০% অভিন্ন পিওর ফাংশন ব্যবহার করে), নাইট ডিউটি, হলিডে ডিউটি, গড় পাঞ্চ ইন/আউট টাইম, এবং পে-রোল পূর্ববর্তী Requisition/Night/Punch সমস্যার তালিকা ও এক-ট্যাপে ERP টিমকে WhatsApp রিপোর্ট পাঠানোর সুবিধা থাকবে। মোবাইল ডেটা বাঁচাতে প্রতি কর্মীর জন্য হালকা প্রি-ইনডেক্সড হিস্ট্রি ফাইল (`data/emp/<DEPT>/<ID>.json`) ও প্রগ্রেসিভ লোডিং ফলব্যাক থাকবে।
- **প্রথমে এই ফাইল পুরো পড়ো। পুরো রেপো আবার পড়ো না। শুধু 'পরের ধাপে পড়ার ফাইল' তালিকার ফাইলগুলো দেখো।**
- **কাজ শুরুর আগে এক-দুই লাইনে বলো তুমি কী বুঝেছ ও কোথা থেকে শুরু করছ, তারপর সরাসরি কাজ শুরু করো। অপ্রয়োজনীয় প্রশ্ন করো না। সত্যিই আটকে গেলে একটি নির্দিষ্ট প্রশ্ন করো।**
- **আগের সিদ্ধান্ত ও শর্ত বদলাবে না।**
- **তুমিও এই ফাইল আপডেট করতে থাকবে, কারণ তোমারও লিমিট শেষ হতে পারে।**

---

## ১. লক্ষ্য ও চূড়ান্ত আউটপুট (কী, কোন ফরম্যাটে, কোন ভাষায়)

- **কী তৈরি হচ্ছে:**
  1. নতুন মোবাইল বটম নেভিগেশন (`Home | Report | Me | Rank | More`) এবং `VS (1v1)`-কে `More` মেনুতে স্থানান্তর।
  2. নতুন রুট `#/profile` (`PERMANENT_PAGES` ও `VALID_PAGES`-এ `profile` যুক্ত)।
  3. শেয়ার্ড অ্যাটেনডেন্স ক্যালকুলেশন মডিউল (`js/calculations/attendance.js`) যা `js/pages/report.js`, `js/calculations/ranking.js`, এবং নতুন প্রোফাইল পেজে একই সাথে ব্যবহৃত হবে।
  4. পিওর প্রোফাইল অ্যাগ্রিগেশন মডিউল (`js/calculations/profile.js`), প্রোফাইল পেজ রেন্ডারার (`js/pages/profile.js`), এবং স্টাইলশিট (`css/profile.css`)।
  5. কর্মীভিত্তিক হালকা হিস্ট্রি JSON জেনারেটর (`scripts/build_emp_history.py` এবং `scripts/to_json.py` ও `scripts/recompute_from_raw.py`-এ ইন্টিগ্রেশন + GitHub Actions workflow আপডেট) এবং ক্লায়েন্ট-সাইড প্রগ্রেসিভ লোডিং ফলব্যাক (Option A + Option B)।
  6. প্রোফাইল পেজের সেকশন A থেকে I পর্যন্ত সম্পূর্ণ ফিচার ইমপ্লিমেন্টেশন।
  7. Node.js ইউনিট টেস্ট (`tests/test_profile_calc.js`), ব্রাউজার অটোমেশন স্ক্রিনশট (`docs/screens/`), সংখ্যার ক্রস-চেক ভেরিফিকেশন, `sw.js` আপডেট, `README.md` আপডেট, এবং `PROFILE_NOTES.md`।
- **ফরম্যাট:** পরিবর্তিত ও নতুন ফাইলগুলো সরাসরি প্রজেক্ট ফোল্ডারে এবং ডাউনলোডযোগ্য আউটপুট হিসেবে (`00_READ_ME_FIRST_HANDOFF.md`, `PROFILE_NOTES.md`, ও সম্পূর্ণ আপডেটেড রেপো জিপ)।
- **ভাষা:** হ্যান্ডঅফ ডকুমেন্টেশন বাংলায়; অ্যাপের UI লেবেলগুলো বর্তমান অ্যাপের কনভেনশন অনুযায়ী ইংরেজি + বাংলা (Hind Siliguri ফন্ট)।

---

## ২. আমার মূল নির্দেশনা (হুবহু)

# TASK: Add an "Employee Profile" ("Me") page to the RPPF Overtime app (checkot.github.io) + fix mobile navigation

You are working in the repo `checkot.github.io` (vanilla HTML/CSS/JS PWA, no framework, GitHub Pages, hash router, data in `data/YYYY-MM.json`). Work PART BY PART following the HANDOFF rules at the top of this message (plan first, then execution part by part, automatically, no approval needed). Do not ask unnecessary questions; when something is ambiguous, pick the sensible option, log it in the handoff file as a decision, and continue. Ask one specific question only if truly blocked. Read the existing code before writing; follow its patterns (helpers like `esc()`, CSS tokens in `css/tokens.css`, dark/light theme, Hind Siliguri font, Bangla+English labels style already used on the pages).

---

## 1. What exists today (verified)

**Mobile bottom nav** (`index.html` ~line 225, styles `css/nav.css`): 5 items → `Rank | Home | Report | 1V1 (VS) | More`.
- `PERMANENT_PAGES = ['search','report','vs']`, `MORE_PAGES = ['history','team','settings','notices','assessment']` in `js/app-main.js` (~line 1513). `leaderboard` is a left side-drawer page, `more` a right side-drawer.
- Router: `js/components/router.js` → `VALID_PAGES` list + `parseHash`/`getHashForPage`.
- `switchPage()` and `updateNavHighlights()` in `js/app-main.js` (~1533–1600).
- Desktop top nav (`.topnav`) has Rank, Home, Report, VS, Notices, History, ERP Team, Settings.
- The More page (`#page-more`, `js/pages/more.js`) is a list of 8 items; "Saved ID Settings" is where the user's own ID is set. The user's own ID = `getPreferredId()` (`js/core/storage.js`).

**Problem:** "VS (1v1)" is a rarely used feature but owns a prime bottom-nav slot, while the thing every employee wants (*my own numbers*) is buried: Home → type ID → Report, one month at a time, no yearly view.

**Data** (per month, `data/YYYY-MM.json`, files exist for 2025-12 … 2026-11): `employees[]` objects with
`id, name, grade, kind, category, area, sub, totalDuty, otHours, holidayCount, nightCount, regularDaysCount, plainDaysCount, holidayDays[{date,doDuty,doExtra,holDuty,holExtra}], nightDays[], nightSuspects[], nightSuspectCount, punchProblems[], requisitionProblems[{date,day,in,out,duty,elapsed,isNight,expectedOt,reason}], requisitionProblemCount, daily[[date,dayName,in,out,duty,ot,holDuty,holExtra,?,?,nightFlag,shiftCode]], otAmount, holidayAmount, nightAmount, totalEarned`.
- There is **no explicit absent/leave field**. Absence is derived in `js/pages/report.js` (`buildEmpReportRows`-style loop starting ~line 80): a day with no punch row is classified by `isPlantOrGovtHolidayDate()`, `isEmployeeOnApprovedLeave()`, "day off after night", `rptIsDayClosed()`, `getMonthDatasetMeta()` → tones `off / offn / absent / none`, flags `isApprovedLeave`, `isGeneralAbsent`, `fpPending`. **Reuse this logic — do not write a second, divergent absent calculation.** If it is not callable on its own, extract it into a pure function (e.g. `js/calculations/attendance.js` → `computeEmpMonthAttendance(emp, ymStr, ctx)`) and make `report.js` call the same function so both always agree.
- Money fields are already computed by the rates engine (`js/calculations/rates.js`) — **never recompute amounts**, just read them.
- Month files are LARGE (2–6.4 MB each; Oct = 6.4 MB). Loading 11–12 months on a phone ≈ 40 MB. See §4 (data loading) — this is the main engineering risk.
- Existing helpers to reuse: `fetchMonthPreIndexedData()`, `computeEmpEarlyExits()` (`js/calculations/early-exit.js`), ranking (`js/calculations/ranking.js`), `downloadReportPNG()` (report share image), ERP team WhatsApp contacts (`#teamList`, `team.json`), `viewEmployeeFromLeaderboard(id)` (an existing in-charge "employee profile" view — inspect it first and make sure the new page does not clash with it; link/reuse where it makes sense).

---

## 2. Navigation change (do this first)

New bottom nav (5 slots, same count, no new crowding):

`Home | Report | Me | Rank | More`  (FINAL order, decided by the owner: Me in the centre, Report next to it, Rank after)

- **Remove the "1V1" bottom-nav button, add "Me" in the centre slot and reorder the others exactly as above** (person icon, label "Me", aria-label "My Profile"). Keep the default landing page as Home (do NOT auto-open Me).
- **Move VS (1v1) into the More list** (new `more-item`, same icon style) and add a "Compare with a colleague" shortcut button inside the profile page. VS must keep working exactly as today (`initVsPage()` etc.); keep `vs` routable (`#/vs`). Make `updateNavHighlights()` highlight **More** while the VS page is active.
- Add `profile` to `PERMANENT_PAGES`, `VALID_PAGES` (router.js) and the desktop `.topnav` (label "My Profile", placed after Report). Hash: `#/profile`. Browser back button, deep link and `Router.onPageSwitched` must work like the other pages.
- If no ID is saved (`getPreferredId()` empty): the Me page shows a friendly empty state with an ID input + "Save & open my profile" button (reuse `openModeSetupModal()` / `setPreferredId()`), not a blank screen.
- In **In-Charge mode**, Me shows the in-charge's own saved ID the same way (do not change in-charge dashboards). Provide a small "View another employee" action that opens the same profile layout for any searched ID (read-only) — only if it is cheap to do given the code; otherwise skip and note it.
- Notices badge (`#noticesBadge`) stays on More.
- Keep `body.nav-scroll-hidden` behaviour, safe-area insets, and dark theme intact.

---

## 3. Profile page content (mobile-first, 360–430 px wide, single scroll column, cards)

Header: avatar initials, name, ID, grade/kind/category, area/sub-section, department. Month/year switcher chips at the top: **This month | Last month | This year (2026) | [month picker]**. All sections below respond to the selected scope (month or year) except where noted as "month-wise".

**A. Year at a glance (hero card)** — Total OT hours, total OT income (BDT), total night duties, total holiday duties, total leave days, total absent days, avg present %. One number each, big and scannable.

**B. Attendance — Leave / Absent** — total leave days, total absent days for the scope + a **month-wise list/heat-strip** (Jan … Nov): present %, leave, absent per month. Example row: `January — 100%`, `February — 95%` (use a thin progress bar + the number). Present % definition (state it in a small "How is this calculated?" tooltip): `present days on scheduled working days ÷ scheduled working days`, where scheduled = closed general working days, excluding Thu/Fri weekly off, plant/govt holidays, post-night day-off; approved leave counts as *not present* (it lowers the %) but is still shown as a separate count from plain absence. The current month is marked "so far" and uses only closed days (`rptIsDayClosed`). Months where the employee does not exist in the file (joined later) show "—", never 0%.

**C. Monthly OT income status** — month-wise bar chart (inline SVG or CSS bars; **no external chart library**) of `totalEarned` with a stacked split OT / Holiday / Night allowance; year total, best month, average per month, change vs last month (▲/▼). Add a 👁 "hide amounts" toggle (blur/mask money on screen, remembered in localStorage) — people open this in a crowded factory.

**D. Total OT** — OT hours: this month, this year, month-wise sparkline; avg OT hours per month.

**E. Total Night** — night duties this month / this year / month-wise (count + the dates as chips; reuse the Shift Dates drawer `#shiftDatesDrawer` chips if suitable).

**F. Holiday duty** — holiday duties this month / this year / month-wise, with date chips and duty/extra hours (`holidayDays`).

**G. My Requisition / OT / Night issues ("Check before payroll")** — the pain point: *"duty hours are long but OT/night is not counted yet."* Build from `requisitionProblems`, `nightSuspects`, `punchProblems`: grouped by month, newest first, each item shows date, In/Out, duty hours, expected OT (`expectedOt`), reason (`reason`). Top summary chips: `Requisition issues N · Night suspects N · Punch problems N`. A green "All clear ✅" state when none. Each item has a **"Report to ERP Team"** button that opens WhatsApp (reuse the ERP Team contact logic) with a pre-filled message: ID, name, date, In/Out, issue. Add a one-line explainer: "Issue দেখালে requisition/OT ERP team-কে জানান".

**H. My average punch** — average In time and average Out time, plus average duty hours per day, for: this month, this year, and **month-wise** table. Rules: ignore days with a missing In or Out (those belong to punch problems); handle night-shift days separately (Out is after midnight — do not average 06:30 AM next-day Out into the day shift Out; use the night flag `r[10]` / shift code `r[11]`); compute with minutes-since-midnight and render HH:MM (12h with AM/PM to match the app). Optional small trend arrow vs previous month.

**I. Extra sections (my research — include if time allows, in this priority order):**
1. **Perfect-attendance streak / best month** badge and a "days worked this month" mini calendar strip (green present, red absent, blue leave, grey off/holiday, purple night).
2. **Early-exit count** (reuse `computeEmpEarlyExits`) per month.
3. **My rank this month** in section (from existing ranking code) with 3-month trend and a "Open Rank" link.
4. **OT vs section average** (anonymous: only the average of the same `area`, never other people's names/IDs).
5. **Share my summary** as image (reuse `downloadReportPNG` approach) — month or year card.
6. **Payslip shortcut** (the Payslip generator already exists — link to it with the month prefilled).
7. Link to **Report** page for the selected month ("Open daily report").

Empty/edge cases: employee not found in a month, current month incomplete, QA vs PR department data paths (`data/qa/…` — use the existing department-aware fetch, do not hardcode `data/`), 31/30/28/29-day months, employee with only one month of data, ID aliases (`resolveEmpAliasId`).

---

**Leave rule (owner decision):** there is NO concept of short casual/sick leave. Any working day without a punch is simply **Absent**. Do not add any leave form, admin UI or employee self-marking. The only "leave" shown is what the existing store already declares (`absent.json` → `longTermLeaves`, e.g. maternity) via the existing `isEmployeeOnApprovedLeave()`, so if the admin adds/removes such a record the profile numbers change automatically with no extra sync code. Show it as "Approved long leave" (separate from Absent) and only when non-zero.

## 4. Data loading (critical — do not skip)

Naively fetching every month JSON is 40+ MB on mobile data. Implement this strategy:

1. **Current/selected month first** via the existing `fetchMonthPreIndexedData()` (already cached) → render immediately with skeleton placeholders for year sections.
2. **Recommended (Option A):** add a build step that writes a small **per-employee history file** `data/emp/<DEPT>/<ID>.json` (~50–80 KB) containing that employee's records for all months **in the same object shape as `employees[]`** (so the existing JS functions like `_buildEmpDayMap`, `computeEmpEarlyExits`, the absent logic keep working unchanged), plus `{month, updatedAt}` metadata. Generate it in `scripts/to_json.py` (and make `scripts/recompute_from_raw.py` / the workflows `.github/workflows/*.yml` regenerate it, committing once per run) and provide a **one-off backfill script** `scripts/build_emp_history.py` that builds all files from the existing `data/*.json` and `data/qa/*.json`. Run the backfill and include the generated files. Client: fetch only `data/emp/<DEPT>/<ID>.json`; fall back to Option B if it 404s.
3. **Option B (fallback, always implement):** progressive loading of the full month files one at a time, newest first, with a visible "Loading 4/11 months…" progress bar, cache **only the compact per-employee extract** (not the 6 MB blob) in localStorage under the namespaced `STORAGE_NAMESPACE` prefix, closed months are immutable → never refetched, current month refetched when `updatedAt` changes.
4. Respect the existing offline/PWA setup: update `sw.js` (`CACHE_NAME` bump, add new JS/CSS files to the precache list; do NOT precache the per-employee JSON), keep stale-while-revalidate behaviour.
5. All heavy aggregation in one pure module `js/calculations/profile.js` (no DOM) so it can be unit-tested from Node; render code in `js/pages/profile.js`; styles in `css/profile.css`. Register the new scripts/CSS in `index.html` in the same style as the others, and in `admin` pages only if they share these scripts.

---

## 5. UI / quality requirements

- Mobile-first at 360×740 and 390×844; also usable on desktop (max-width card column, centered). No horizontal scroll. Tap targets ≥ 44 px. Respect `prefers-color-scheme` + the app's manual theme (`data-theme`). Use existing CSS variables; no new fonts, no external CDNs, no new dependencies.
- Numbers: use existing formatting helpers; BDT amounts with thousands separators; hours with 1–2 decimals; keep `bn()` usage consistent with the rest of the app.
- Performance: render the first meaningful content < 1 s on the cached path; no layout shift (reserve skeleton heights); no blocking work on the main thread longer than ~50 ms (chunk the per-month aggregation).
- Accessibility: charts have text alternatives (the numbers are always visible as text too), colour is never the only signal, `aria-current` on the active nav item.
- Privacy: the page only ever shows the saved ID's own data (plus the anonymous section average). Do not log or send any of it to Firebase/telemetry; do not add new writes anywhere.
- Do not change rates/allowance logic, leaderboard behaviour, admin panel, or access-control. Do not rename existing IDs/functions. Keep the existing in-charge flows working.

## 6. Verification (you must do this yourself and show evidence)

1. Serve the repo locally (`python3 -m http.server`) and drive it with Playwright (Chromium is installed; use the Python or Node playwright already present; do not install anything). Emulate a phone viewport 390×844 (`deviceScaleFactor: 2` for screenshots).
2. Test with real IDs from the data: e.g. `556490` (Siratun Nabi, casual, Packing Hall, Nov has 5 requisition problems and 2 punch problems), an employee with night duties in Oct (find one in `data/2026-10.json` where `nightCount>0`), one with holidays, one who exists in only some months, one with zero issues, and a QA employee. Also test: no saved ID, unknown ID, offline (service worker), light and dark theme.
3. Cross-check numbers programmatically: for at least 5 employees compute year totals (OT hours, night, holiday, earned, absent, avg punch) independently with a small Python script from `data/*.json` and assert they match what the page shows. Verify the page's absent/leave counts equal what the Report page shows for the same month (they must use the same function).
4. Screenshot the nav (all 5 tabs, active states, More list with VS), and every profile section in light + dark. Look at the screenshots yourself and fix anything cramped, clipped, or misaligned before finishing.
5. Check the browser console is free of errors/warnings, the back button works across Me → Report → Me, `#/profile` deep link works on cold start, VS still works from More.
6. Update `README.md` (feature table + project structure), bump `sw.js` cache version, and write `PROFILE_NOTES.md` (decisions made, formulas used, data-size numbers before/after, anything skipped and why).

## 7. Deliverable

Working changes in the repo (all files listed above), the generated per-employee history files (if Option A), screenshots saved under `docs/screens/`, and a short final summary: what changed, the exact present-% formula, data-size impact, and what you skipped. Make small logical git commits if git is available.

---

## ৩. শর্ত ও সিদ্ধান্ত (কী ঠিক হয়েছে, কেন)

1. **মোবাইল বটম নেভ অর্ডার:** মালিকের চূড়ান্ত সিদ্ধান্ত অনুযায়ী বটম নেভের ৫টি ট্যাব হবে `Home | Report | Me | Rank | More`। `Me` থাকবে একদম মাঝখানে (৩য় স্লট), `Report` ২য় স্লটে, `Rank` ৪র্থ স্লটে।
2. **VS (1v1) পেজ রাউটিং ও হাইলাইটিং:** `vs` এখন `PERMANENT_PAGES` থাকছে কিন্তু বটম নেভে নিজস্ব বাটন না থাকায় `updateNavHighlights()`-এ যখন `currentPermanentPage === 'vs'` হবে, তখন বটম নেভে `More` (`data-nav="more"`) হাইলাইট হবে এবং ডেক্সটপ `.topnav`-এ `VS (1v1)` হাইলাইট হবে। `#page-more`-এ একটি নতুন `more-item` ("VS (1v1) Compare") যুক্ত করা হয়েছে।
3. **শেয়ার্ড অ্যাটেনডেন্স ইঞ্জিন (`js/calculations/attendance.js`):** `js/pages/report.js`-এর `_rptRows(ctx)` এবং `js/calculations/ranking.js`-এর `computeEmpGeneralAbsents`-কে একীভূত করে `computeEmpMonthAttendance(emp, ymStr, ctx)` তৈরি করা হবে। `_rptRows(ctx)` ভেতরে এই একই ফাংশন কল করবে, ফলে Report পেজ ও Profile পেজে সাধারণ অনুপস্থিতি (General Absent) এবং অনুমোদিত দীর্ঘ ছুটি (Approved Long Leave / Maternity Leave) সবসময় ১০০% এক হবে।
4. **Present % ফর্মুলা:**
   - `scheduledWorkingDays`: মাসের ১ তারিখ থেকে `min(lastDayOfMonth, maxDatasetDay)` পর্যন্ত যে দিনগুলো `rptIsDayClosed(y, m, d)` অনুযায়ী ক্লোজড এবং যেগুলো সাপ্তাহিক ছুটি (Thu/Fri), প্ল্যান্ট/সরকারি ছুটি (`isPlantOrGovtHolidayDate`), বা নাইট ডিউটি পরবর্তী বিশ্রাম দিবস (`afterNight`) নয়।
   - যদি কোনো কর্মী সাপ্তাহিক ছুটি বা সরকারি ছুটির দিনে কাজ করেন (`o` থাকে), সেটি তার মোট উপস্থিত দিন (`totalPresentDays`) এবং ডিউটি আওয়ারে যোগ হবে, কিন্তু নির্ধারিত কার্যদিবসের উপস্থিতি (`presentOnScheduledDays`) হিসাব করা হবে শুধুমাত্র নির্ধারিত সাধারণ কার্যদিবসে উপস্থিতির ওপর, যাতে Present % কখনো ১০০%-এর বেশি না হয়:
     `presentPct = scheduledWorkingDays > 0 ? Math.round((presentOnScheduledDays / scheduledWorkingDays) * 1000) / 10 : null`।
   - অনুমোদিত দীর্ঘ ছুটি (`isApprovedLeave`, যেমন Maternity Leave) নির্ধারিত কার্যদিবসের অন্তর্ভুক্ত থাকে এবং সেখানে অনুপস্থিত থাকলে সেটি `approvedLeaveDays` হিসেবে আলাদা দেখায় (এবং `presentOnScheduledDays` কমায়), কিন্তু `generalAbsentDays`-এ যোগ হয় না।
5. **পার-এমপ্লয়ি হিস্ট্রি ফাইল (`data/emp/<DEPT>/<ID>.json`) + মেটাডেটা:**
   - `data/YYYY-MM.json`-এ প্রতিটি মাসে প্রায় ৯০০+ কর্মীর সম্পূর্ণ ডেটা থাকে (২–৬.২ মেগাবাইট)। কিন্তু একজন কর্মী যখন `Me` পেজ খোলেন, তার কেবল নিজের ১১–১২ মাসের ডেটা এবং সেকশন গড়/র‍্যাংকিংয়ের জন্য সামান্য সারাংশ দরকার।
   - আমরা `scripts/build_emp_history.py` তৈরি করব যা প্রতিটি কর্মীর জন্য `data/emp/PR/<ID>.json` এবং `data/emp/QA/<ID>.json` তৈরি করবে। পাশাপাশি মাসভিত্তিক সেকশন গড় ও র‍্যাংকিং দ্রুত দেখানোর জন্য প্রতিটি ফাইলে ওই মাসের `sectionStats` (ঐ কর্মীর সেকশনের গড় OT, গড় ডিউটি, মোট কর্মী সংখ্যা এবং ওই কর্মীর র‍্যাংক পজিশন) প্রি-কম্পিউট করে যুক্ত থাকবে, যাতে র‍্যাংকিং বা সেকশন গড় দেখানোর জন্য ৬ মেগাবাইটের মাসিক ফাইল ডাউনলোড করতে না হয়!
6. **টাকা লুকানোর বাটন (Hide Amounts Toggle):** `localStorage`-এ `STORAGE_NAMESPACE + 'renata_profile_hide_amt_v1'` কী-তে সংরক্ষিত থাকবে। অন থাকলে সকল টাকার অংক (`৳ ••••`) মাস্ক/ব্লার হবে।
7. **In-Charge Mode ও "View another employee":** ইনচার্জ মোডেও `Me` ট্যাবে ডিফল্টভাবে ইনচার্জের নিজের সেভ করা আইডি দেখাবে, তবে হেডারে একটি **"View another employee"** সার্চ বাটন/ইনপুট থাকবে যা দিয়ে যেকোনো কর্মীর প্রোফাইল রিড-অনলি মোডে দেখা যাবে (এবং সহজেই "Back to my profile"-এ ফেরা যাবে)।

---

## ৪. প্ল্যান: ছোট ছোট ধাপ (`[ ]` বাকি / `[~]` চলছে / `[x]` শেষ)

- [x] **Stage 0:** রেপো বিশ্লেষণ, আর্কিটেকচার যাচাই এবং `00_READ_ME_FIRST_HANDOFF.md` (REPO MAP ও পূর্ণাঙ্গ প্ল্যানসহ) তৈরি।
- [x] **Part 1 — Navigation & Routing:**
  - `index.html`-এ বটম নেভ অর্ডার `Home | Report | Me | Rank | More` করা, ডেক্সটপ `.topnav`-এ `My Profile` যোগ করা, `#page-more`-এ `VS (1v1)` আইটেম যোগ করা, এবং `#page-profile` কন্টেইনার তৈরি করা।
  - `js/components/router.js`-এ `VALID_PAGES`-এ `profile` যোগ করা ও `#/profile` রাউটিং সাপোর্ট।
  - `js/app-main.js`-এ `PERMANENT_PAGES`-এ `profile` যোগ করা, `updateNavHighlights()`-এ `vs` পেজে থাকাকালীন বটম নেভের `More` হাইলাইট করা এবং `switchPage('profile')`-এ `initProfilePage()` কল করা।
- [x] **Part 2 — Calculation Layer & Unit Tests:**
  - `js/calculations/attendance.js` তৈরি: `computeEmpMonthAttendance(emp, ymStr, ctx)` ও `rptIsDayClosed(y, m, d)` এক্সট্র্যাক্ট করা এবং `js/pages/report.js` ও `js/calculations/ranking.js`-কে এই একক ফাংশনের সাথে যুক্ত করা।
  - `js/calculations/profile.js` তৈরি: পিওর ফাংশনসমূহ (Year/Month scope aggregation, Attendance summary & heat-strip, Monthly OT income breakdown & MoM change, OT sparkline data, Night/Holiday dates aggregation, Requisition/NightSuspect/Punch issues grouping, Average Punch In/Out day vs night calculation, Streak & mini calendar, Early exits, Section average & rank summary)।
  - `tests/test_profile_calc.js` লিখে Node.js দিয়ে বাস্তব `data/*.json` ফাইলের ওপর অটোমেটেড টেস্ট চালানো।
- [x] **Part 3 — Data Loading (Per-Employee History + Backfill + Progressive Fallback + SW):**
  - `scripts/build_emp_history.py` তৈরি ও চালানো (`data/emp/PR/<ID>.json` এবং `data/emp/QA/<ID>.json` জেনারেট করা, সাথে `datasetMeta` ও `sectionStats` সংযুক্ত করা)।
  - `scripts/to_json.py`, `scripts/recompute_from_raw.py`, এবং `.github/workflows/*.yml` আপডেট করা যাতে নতুন ডেটা আসলে স্বয়ংক্রিয়ভাবে `data/emp/` আপডেট হয়।
  - ক্লায়েন্ট লোডার (`fetchEmployeeProfileHistory` in `js/pages/profile.js`): প্রথমে ক্যাশড/সিলেক্টেড মাস রেন্ডার, এরপর Option A (`data/emp/<DEPT>/<ID>.json`) ফেচ, এবং ৪0৪ হলে Option B (প্রগ্রেসিভ মান্থলি লোডিং + কম্প্যাক্ট localStorage ক্যাশ + প্রগ্রেস বার)।
  - `sw.js`-এ নতুন ফাইলগুলো প্রিক্যাশে যোগ করা ও `CACHE_NAME` বাম্প করা।
- [x] **Part 4 — UI Sections A, B, C & Header/Empty State:**
  - `css/profile.css` ও `js/pages/profile.js`-এ প্রোফাইল হেডার (অ্যাভাটার, নাম, আইডি, পদবি, সেকশন, ডিপার্টমেন্ট, স্কোপ সুইচার চিপস: This month | Last month | This year (2026) | Month Picker, এবং In-Charge/Colleague switcher)।
  - সেভ করা আইডি না থাকলে বন্ধুসুলভ Empty State (আইডি ইনপুট + অটো-কমপ্লিট + "Save & open my profile")।
  - Section A (Year/Scope at a glance hero card), Section B (Attendance — Leave/Absent + Month-wise heat-strip + "How is this calculated?" টুলটিপ), Section C (Monthly OT income stacked bar chart + 👁 Hide Amounts toggle)।
- [x] **Part 5 — UI Sections D, E, F, H:**
  - Section D (Total OT + month-wise SVG sparkline + avg OT/month)।
  - Section E (Total Night + date chips + shift drawer integration)।
  - Section F (Holiday duty + date chips with DO/Hol hours breakdown)।
  - Section H (My average punch — Day shift In/Out vs Night shift Out, average duty hours/day, month-wise table + trend arrow)।
- [x] **Part 6 — UI Section G & Section I Extras:**
  - Section G ("Check before payroll" — Requisition issues, Night suspects, Punch problems grouped by month newest first, green "All clear ✅" state, per-item & bulk "Report to ERP Team" WhatsApp button reusing `openErpSupportModal`)।
  - Section I Extras (১. Perfect-attendance streak / best month badge + mini calendar strip, ২. Early-exit count per month, ৩. My rank this month + 3-month trend + Open Rank link, ৪. OT vs anonymous section average, ৫. Share my summary as PNG image, ৬. Payslip shortcut, ৭. Open daily report link)।
- [x] **Part 7 — Verification, Screenshots, Cross-Checks & Final Docs:**
  - লোকাল সার্ভার (`python3 -m http.server`) ও হেডলেস Chromium (390×844, `deviceScaleFactor: 2`) দিয়ে রিয়েল আইডি (`556490`, নাইট ডিউটি কর্মী, হলিডে কর্মী, আংশিক মাসের কর্মী, জিরো-ইস্যু কর্মী, QA কর্মী, নো-আইডি স্টেট, লাইট ও ডার্ক থিম) টেস্ট ও স্ক্রিনশট (`docs/screens/`) গ্রহণ।
  - Python স্ক্রিপ্ট দিয়ে অন্তত ৫ জন কর্মীর বার্ষিক ও মাসিক হিসাব স্বতন্ত্রভাবে যাচাই করে পেজের সাথে ১০০% মিল প্রমাণ করা।
  - `README.md` আপডেট এবং `PROFILE_NOTES.md` তৈরি।

---

## ৫. বর্তমান অবস্থা
- **এই মুহূর্তে কোন ধাপে:** **সবগুলো ধাপ (Stage 0 এবং Part 1 থেকে Part 7 পর্যন্ত) ১০০% সম্পন্ন (`[x]`)!**
- **শেষ কী করেছি:**
  - **Stage 0 `[x]`**: রেপো সম্পূর্ণ বিশ্লেষণ করে `00_READ_ME_FIRST_HANDOFF.md` তৈরি করা হয়েছে।
  - **Part 1 `[x]`**: মোবাইল বটম নেভিগেশন (`Home | Report | Me | Rank | More`), `#/profile` রাউট, `VS (1v1)`-কে `More`-এ স্থানান্তর, এবং Empty State সম্পন্ন।
  - **Part 2 `[x]`**: `js/calculations/attendance.js`-এ শেয়ার্ড Absent/Leave/Present% পিওর ফাংশন আলাদা করে `report.js` ও `ranking.js`-এ যুক্ত করা হয়েছে; `js/calculations/profile.js` তৈরি এবং `tests/test_profile_calc.js`-এ ৫/৫ টেস্ট পাস।
  - **Part 3 `[x]`**: `scripts/build_emp_history.py` তৈরি ও ব্যাকফিল রান করে ১,২১৩টি PR ফাইল (`data/emp/PR/*.json`, গড় ২৩.৭ KB) ও ৭২টি QA ফাইল (`data/emp/QA/*.json`, গড় ১.৮ KB) জেনারেট করা হয়েছে; ওয়ার্কফ্লো ও `sw.js` আপডেট করা হয়েছে।
  - **Part 4 `[x]`**: প্রোফাইল হেডার, স্কোপ চিপস, কলিগ রিড-অনলি সুইচার, এবং Sections A (Hero), B (Attendance Heat-Strip + Tooltip + Approved Long Leave), C (Stacked OT Income + Hide Taka toggle) সম্পন্ন।
  - **Part 5 `[x]`**: Sections D (Total OT + Sparkline + Date chips), E (Total Night + Date chips), F (Holiday Duty + Date chips), এবং H (My Average Punch — Day Out ও Night Out `(+1)` আলাদা করে টেবিল) সম্পন্ন।
  - **Part 6 `[x]`**: Section G (Check Before Payroll + এক ট্যাপে `"Report to ERP Team"` WhatsApp মেসেজ) এবং Section I-এর ৭টি বোনাস ফিচার (`I1`..`I7` — Streak Calendar, Early Exits, Section Rank, OT vs Section Avg, Share PNG, Payslip, Shortcuts) সম্পন্ন।
  - **Part 7 `[x]`**: হেডলেস Chromium ব্রাউজারে (`390×844 @ 2x DPR`) ১৪টি মোবাইল স্ক্রিনশট (`docs/screens/01_*.png` .. `14_*.png`) ক্যাপচার ও ভিজ্যুয়াল যাচাই; ৬ জন কর্মীর (`556490`, `RF20850`, `CF8355`, `CF3028`, `556496`, `556515`) জন্য স্বাধীন Python স্ক্রিপ্ট ও Report পেজের সাথে ১০০% মিল যাচাই; `README.md` ও `PROFILE_NOTES.md` তৈরি।
- **পরের ধাপ কী:** কোনো ধাপ বাকি নেই — প্রজেক্টটি সরাসরি ডিপ্লয় করার জন্য প্রস্তুত।

## ৬. REPO MAP

### ৬.১ প্রজেক্টের উদ্দেশ্য, টেক স্ট্যাক ও কমান্ড
- **উদ্দেশ্য:** Renata PLC, Rajendrapur Potent Product Facility (RPPF)-এর প্রোডাকশন (PR) ও কোয়ালিটি অ্যাসুরেন্স (QA) কর্মীদের মাসিক ওভারটাইম, নাইট ডিউটি, হলিডে ভাতা, পাঞ্চ সমস্যা ও র‍্যাংকিং দেখার অফলাইন-ফার্স্ট PWA।
- **টেক স্ট্যাক:** Vanilla HTML5, CSS3 (Custom Properties / Tokens, Dark/Light Theme), Vanilla JavaScript (ES6+, কোন ফ্রেমওয়ার্ক বা বান্ডলার নেই), Python 3 (`openpyxl` দিয়ে Excel → JSON বিল্ড স্ক্রিপ্ট), GitHub Pages + GitHub Actions।
- **চালানো ও টেস্ট করার কমান্ড:**
  - লোকাল সার্ভার: `python3 -m http.server 8000`
  - ডেটা রিকম্পিউট: `python3 scripts/recompute_from_raw.py --all`
  - কর্মী হিস্ট্রি ব্যাকফিল (নতুন): `python3 scripts/build_emp_history.py`
  - ইউনিট টেস্ট (নতুন): `node tests/test_profile_calc.js`

### ৬.২ ফোল্ডার কাঠামো ও প্রতিটি গুরুত্বপূর্ণ ফাইলের এক লাইনের বর্ণনা
- `index.html` — মূল সিঙ্গেল-পেজ অ্যাপ্লিকেশন (SPA) শেল; এতে সব পেজ কন্টেইনার (`#page-search`, `#page-report`, `#page-vs`, `#page-leaderboard`, `#page-more`, `#page-team`, `#page-notices`, `#page-history`, `#page-settings`, `#page-assessment`), বটম নেভ, টপ নেভ ও মোডালগুলো আছে।
- `admin.html` — স্ট্যান্ডঅ্যালোন অ্যাডমিন কন্ট্রোল প্যানেল।
- `sw.js` — সার্ভিস ওয়ার্কার (প্রিক্যাশ তালিকা + নেটওয়ার্ক-ফার্স্ট HTML/JSON এবং স্টেল-হোয়াইল-রিভ্যালিডেট স্ট্যাটিক অ্যাসেট)।
- `areas.json` — কর্মীদের সেকশন/এরিয়া ম্যাপিং (`areas`), সাব-সেকশন ও জেন্ডার/টাইপ (`details`), রেট টেবিল (`rateTable`), এবং ছুটির কনফিগারেশন (`holidays`)।
- `absent.json` — দৈনিক অনুপস্থিতির লগ এবং অনুমোদিত দীর্ঘমেয়াদী ছুটির তালিকা (`longTermLeaves`, যেমন ৬ মাসের Maternity Leave)।
- `shift-rules.json` — সাধারণ ও বিশেষ শিফটের (যেমন রমজান) শুরুর ও শেষের সময় এবং গ্রেস মিনিট (`early-exit.js` ব্যবহার করে)।
- `team.json` — ERP সাপোর্ট টিমের সদস্যদের নাম, আইডি, সেকশন ও WhatsApp নম্বর।
- `notices.json` — ফ্যাক্টরির নোটিশ বোর্ডের ডেটা।
- `css/tokens.css` — লাইট ও ডার্ক থিমের সব ডিজাইন টোকেন (`--bg`, `--surface`, `--brand`, `--success`, `--warning`, `--danger`, `--radius`, `--space-*`)।
- `css/nav.css` — `.topnav`, `.bottom-nav`, `.bn-item`, এবং `.page` কন্টেইনারের স্টাইল।
- `css/components.css` ও `css/pages.css` — কার্ড, বাটন, ব্যাজ, টেবিল, মোডাল এবং পেজগুলোর স্টাইল।
- `js/core/config.js` — গ্লোবাল কনস্ট্যান্ট, ডিপার্টমেন্ট কনফিগারেশন (`PR`, `QA`), `STORAGE_NAMESPACE`, এবং `localStorage` কী-সমূহ।
- `js/core/state.js` — ইন-মেমরি গ্লোবাল স্টেট (`RATE_TABLE`, `AREA_MAP`, `currentSearchId`, `currentMonth`, `monthIndexMemoryCache`, `ABSENT_STORE`)।
- `js/core/storage.js` — `getPreferredId()`, `setPreferredId()`, `getSavedSalary()`, এবং সার্চ হিস্ট্রি হেল্পার।
- `js/core/utils.js` — `esc()`, `bn()`, `resolveEmpAliasId()`, `cleanPunchValue()`, `isPunchMissing()`, `getEmpOtDays()`, `fitAll()`।
- `js/core/access-control.js` ও `js/core/access-crypto.js` — রোল-বেসড অ্যাক্সেস কন্ট্রোল, ইনচার্জ ও এক্সিকিউটিভ ভিজিবিলিটি গার্ড (`isExecHiddenFor`)।
- `js/calculations/rates.js` — ক্যাটাগরি ও গ্রেড অনুযায়ী ওভারটাইম, নাইট ও হলিডে টাকার হিসাব (`applyTypeOverride`, `calculateEarnings`)।
- `js/calculations/early-exit.js` — শিফট শেষ হওয়ার আগে গেট পাস/আর্লি এক্সিট শনাক্তকরণ (`computeEmpEarlyExits`, `getEarlyExitCount`)।
- `js/calculations/ranking.js` — লিডারবোর্ড সর্টিং, `computeEmpRequisitionProblems(e)` এবং `computeEmpGeneralAbsents(e, targetMonthStr, prevNightSetOrBool)`।
- `js/components/router.js` — হ্যাশ রাউটার (`VALID_PAGES`, `parseHash`, `getHashForPage`, `activateRoute`, ব্যাক বাটন ডাবল-প্রেস গার্ড)।
- `js/app-main.js` — অ্যাপের মূল কন্ট্রোলার: `fetchMonthPreIndexedData()`, `_buildEmpDayMap()`, `getMonthDatasetMeta()`, `isPlantOrGovtHolidayDate()`, `isEmployeeOnApprovedLeave()`, `switchPage()`, `updateNavHighlights()`, `openErpSupportModal()`, `generatePayslipCanvas()`, `autoLoad()`।
- `js/pages/report.js` — ডেইলি ওয়ার্ক লগ টেবিল (`_rptRows`, `_rptHtml`), `rptIsDayClosed()`, PNG ডাউনলোড (`downloadReportPNG`), এবং `renderInstantEmployeeRecord()`।
- `js/pages/vs.js` — ১ বনাম ১ / কাস্টম কর্মী তুলনা পেজ (`initVsPage`, `runComparison`)।
- `js/pages/leaderboard.js` — র‍্যাংকিং পেজ, `computeEmpAvgDutyAndInOut(e)`, এবং `viewEmployeeFromLeaderboard(empId)`।
- `js/pages/more.js` — `More` ড্রয়ারের রেন্ডারার (`renderMorePage`)।
- `scripts/to_json.py` ও `scripts/recompute_from_raw.py` — Empress Excel এবং `.raw.json` আর্কাইভ থেকে `data/YYYY-MM.json` ও `data/latest.json` তৈরির স্ক্রিপ্ট।
- `data/2025-12.json` … `data/2026-11.json` এবং `data/qa/2026-11.json` — মাসিক প্রি-ইনডেক্সড কর্মী ডেটা।

### ৬.৩ ডেটা ও কন্ট্রোল ফ্লো কীভাবে চলে
1. অ্যাপ চালু হলে `autoLoad()` (`js/app-main.js`) বর্তমান ডিপার্টমেন্ট (`PR` বা `QA`) অনুযায়ী `data/latest.json` (বা `data/qa/latest.json`) এবং `areas.json` ও `absent.json` লোড করে `monthIndexMemoryCache`-এ রাখে।
2. `Router.init()` URL-এর হ্যাশ (`#/search`, `#/report`, `#/profile` ইত্যাদি) পার্স করে `activateRoute()`-এর মাধ্যমে `switchPage()` কল করে।
3. `PERMANENT_PAGES` (`search`, `report`, `profile`, `vs`) সরাসরি `.page.active` হিসেবে রেন্ডার হয়; আর `leaderboard` বাঁ দিকের ড্রয়ার এবং `more` ও `MORE_PAGES` ডান দিকের ড্রয়ার হিসেবে খোলে।
4. প্রতিটি কর্মীর মাসিক অবজেক্টে `daily` অ্যারে থাকে: `[date, dayName, in, out, regDuty, regOt, doDuty, doOt, holDuty, holOt, nightFlag, shiftCode]`। টাকার অংক (`otAmount`, `holidayAmount`, `nightAmount`, `totalEarned`) বিল্ড টাইমে ও `applyTypeOverride(e)`-এ ক্যালকুলেট হয়।

### ৬.৪ কোডিং কনভেনশন ও যা ভাঙা যাবে না
- কোনো এক্সটার্নাল JS/CSS লাইব্রেরি বা ফ্রেমওয়ার্ক যোগ করা যাবে না (চার্টের জন্য ইনলাইন SVG বা পিওর CSS ব্যবহার করতে হবে)।
- সব ডাইনামিক HTML স্ট্রিংয়ে `esc()` ব্যবহার করতে হবে।
- থিমের জন্য হার্ডকোডেড রঙের বদলে `css/tokens.css`-এর CSS ভেরিয়েবল (`var(--surface)`, `var(--text)`, `var(--brand)`, ইত্যাদি) ব্যবহার করতে হবে যাতে লাইট ও ডার্ক উভয় থিমে নিখুঁত দেখায়।
- টাকার হিসাব কখনো নতুন করে ফর্মুলা দিয়ে বানানো যাবে না—সবসময় `emp.otAmount`, `emp.holidayAmount`, `emp.nightAmount`, `emp.totalEarned` (অথবা `applyTypeOverride(emp)`-এর ফলাফল) থেকে পড়তে হবে।
- রেট লজিক, লিডারবোর্ড, অ্যাডমিন প্যানেল, অ্যাক্সেস কন্ট্রোল (`isExecHiddenFor`), এবং ইনচার্জ ড্যাশবোর্ডের কোনো বিদ্যমান ফাংশন বা আইডি ভাঙা বা রিনেম করা যাবে না।

### ৬.৫ কোন ফাইল এখনও ছোঁয়া হয়নি
- এখন পর্যন্ত রেপোর কোনো কোড ফাইল পরিবর্তন করা হয়নি (শুধুমাত্র এই হ্যান্ডঅফ ফাইল `00_READ_ME_FIRST_HANDOFF.md` তৈরি করা হয়েছে)।

---

## ৭. বদলানো/তৈরি ফাইলের তালিকা

1. `00_READ_ME_FIRST_HANDOFF.md` — নতুন তৈরি ও আপডেটেড (হ্যান্ডঅফ ট্র্যাকার, REPO MAP ও প্ল্যান; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
2. `index.html` — বদলানো হয়েছে (বটম নেভ `Home | Report | Me | Rank | More`, টপ নেভে `My Profile`, `#page-more`-এ `VS (1v1)`, `#page-profile` কন্টেইনার ও নতুন JS/CSS ট্যাগ যোগ; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
3. `js/components/router.js` — বদলানো হয়েছে (`VALID_PAGES`-এ `profile` এবং `#/profile` রাউট হ্যান্ডলিং যোগ; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
4. `js/app-main.js` — বদলানো হয়েছে (`PERMANENT_PAGES`-এ `profile`, `updateNavHighlights()`-এ `vs` → `more` হাইলাইট এবং `initProfilePage()` কল যোগ; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
5. `js/calculations/attendance.js` — নতুন তৈরি (শেয়ার্ড পিওর উপস্থিতি, অনুপস্থিতি ও অনুমোদিত ছুটির ইঞ্জিন; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
6. `js/calculations/profile.js` — নতুন তৈরি (প্রোফাইল পেজের পিওর অ্যাগ্রিগেশন ইঞ্জিন; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
7. `js/pages/report.js` — বদলানো হয়েছে (`_rptRows`-কে `computeEmpMonthAttendance`-এর সাথে যুক্ত করা হয়েছে; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
8. `js/calculations/ranking.js` — বদলানো হয়েছে (`computeEmpGeneralAbsents`-কে `computeEmpMonthAttendance`-এর সাথে যুক্ত করা হয়েছে; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
9. `tests/test_profile_calc.js` — নতুন তৈরি (Node.js অটোমেটেড ইউনিট টেস্ট স্যুট; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
10. `scripts/build_emp_history.py` — নতুন তৈরি (পার-এমপ্লয়ি হিস্ট্রি JSON বিল্ডার ও ব্যাকফিল স্ক্রিপ্ট; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
11. `scripts/to_json.py` — বদলানো হয়েছে (`build_emp_history` ইন্টিগ্রেশন যোগ; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
12. `scripts/recompute_from_raw.py` — বদলানো হয়েছে (`build_emp_history` ইন্টিগ্রেশন যোগ; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
13. `.github/workflows/empress.yml`, `manual-excel.yml`, `recompute-from-raw.yml` — বদলানো হয়েছে (`data/emp/` স্টেজিং যোগ; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
14. `sw.js` — বদলানো হয়েছে (`CACHE_NAME` বাম্প ও প্রিক্যাশ আপডেট; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
15. `data/emp/PR/*.json` ও `data/emp/QA/*.json` — নতুন তৈরি (১,২৮৫টি পার-এমপ্লয়ি হিস্ট্রি ফাইল; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
16. `css/profile.css` — নতুন তৈরি (প্রোফাইল পেজের সম্পূর্ণ রেসপনসিভ ও ডার্ক/লাইট থিম স্টাইলশিট; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*
17. `js/pages/profile.js` — নতুন তৈরি (ডেটা লোডার + হেডার + সেকশন A থেকে I পর্যন্ত সম্পূর্ণ ইমপ্লিমেন্টেশন; অবস্থা: সম্পূর্ণ)। *এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।*

---

## ৮. পরের ধাপে পড়ার ফাইল (শুধু নাম)

- `css/tokens.css`
- `js/calculations/profile.js`
- `js/pages/report.js`
- `js/pages/search.js`

---

## ৯. পরিচিত সমস্যা, অনুমান, এবং যা করা যাবে না

- **পরিচিত সমস্যা / ঝুঁকি:** ১২ মাসের সম্পূর্ণ JSON ফাইলগুলো একত্রে প্রায় ৩৬ মেগাবাইট। তাই মোবাইলে কখনোই সবগুলো পূর্ণ মাসিক ফাইল একসাথে ফেচ করা যাবে না—অবশ্যই পার-এমপ্লয়ি হিস্ট্রি ফাইল (`data/emp/<DEPT>/<ID>.json`) প্রথমে চেষ্টা করতে হবে এবং ফলব্যাক হিসেবে এক-একটি মাস প্রগ্রেসিভলি লোড করে শুধু ওই কর্মীর স্লিম অবজেক্ট `localStorage`-এ ক্যাশ করতে হবে।
- **অনুমান (সিদ্ধান্ত হিসেবে নথিভুক্ত):**
  - `This year (2026)` স্কোপ মানে ২০২৬ সালের জানুয়ারি থেকে সর্বশেষ উপলব্ধ মাস পর্যন্ত (`2026-01` … `2026-11`, এবং ভবিষ্যতে `2026-12` আসলে সেটিও)। `2025-12` মাসটি মান্থ-পিকার থেকে আলাদাভাবে দেখা যাবে, কিন্তু ২০২৬ সালের বার্ষিক যোগফলে ঢুকবে না (যাতে "This year (2026)" শিরোনামের সাথে ডেটার ১০০% সামঞ্জস্য থাকে; তবে ডিসেম্বর ২০২৫-এর ৩১ তারিখের নাইট ডিউটি জানুয়ারি ২০২৬-এর ১ তারিখের post-night rest day নির্ণয়ে ব্যবহৃত হবে)।
- **যা করা যাবে না:**
  - কোনো অবস্থাতেই নতুন কোনো শর্ট লিভ/সিক লিভ ফর্ম বা সেলফ-মার্কিং যোগ করা যাবে না।
  - Firebase বা অন্য কোনো টেলিমেট্রিতে প্রোফাইল পেজের ডেটা পাঠানো বা রাইট করা যাবে না।
  - হোম পেজ (`search`) পরিবর্তন করে অটোমেটিক `Me` পেজকে ডিফল্ট ল্যান্ডিং পেজ বানানো যাবে না।
