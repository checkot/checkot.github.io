# 00_READ_ME_FIRST_HANDOFF.md
> সর্বশেষ আপডেট: 2026-11-14 · **সব Part (Stage 0 + 1–7) সম্পন্ন** · চূড়ান্ত প্যাকেজ P7 ডেলিভারড · কোনো কোড-কাজ বাকি নেই; শুধু §৫-এর "owner-এর হাতে বাকি" তালিকা

---

# NEXT AI INSTRUCTIONS (পরবর্তী AI-এর জন্য — এটি আগে পুরো পড়ো)

তুমি একটি **অসম্পূর্ণ কাজ গ্রহণ করছ। আগের AI-এর লিমিট শেষ হয়ে গেছে।**

**কাজের লক্ষ্য (এক অনুচ্ছেদে):** `checkot.github.io` (RPPF Overtime PWA — vanilla HTML/CSS/JS, GitHub Pages, hash router, ডেটা `data/YYYY-MM.json`) অ্যাপে একটি নতুন "Me" (Employee Profile) পেজ যোগ করা, যেখানে কর্মী নিজের বছর/মাসভিত্তিক OT, রাত, ছুটির ডিউটি, Absent/Leave, গড় Punch, মাসিক আয় এবং payroll-আগে-চেক-করার সমস্যা (requisition/night/punch) একসাথে দেখবে; একই সাথে মোবাইল bottom-nav বদলে `Home | Report | Me | Rank | More` করা এবং VS (1v1) কে More-এ সরানো। ডেটা লোডিং হবে প্রতি-কর্মী ছোট history ফাইল (Option A) + progressive fallback (Option B) দিয়ে।

**আমার মূল নির্দেশনা:** হুবহু নিচে "২. আমার মূল নির্দেশনা" অংশে আছে (সারাংশ নয়)।

**কাজের নিয়ম:**
1. প্রথমে এই ফাইল পুরো পড়ো। **পুরো রেপো আবার পড়ো না।** শুধু "৮. পরের ধাপে পড়ার ফাইল" তালিকার ফাইলগুলো দেখো।
2. কাজ শুরুর আগে এক-দুই লাইনে বলো তুমি কী বুঝেছ ও কোথা থেকে শুরু করছ, তারপর সরাসরি কাজ শুরু করো। অপ্রয়োজনীয় প্রশ্ন করো না। সত্যিই আটকে গেলে **একটি** নির্দিষ্ট প্রশ্ন করো।
3. **আগের সিদ্ধান্ত ও শর্ত বদলাবে না।**
4. **তুমিও এই ফাইল আপডেট করতে থাকবে**, কারণ তোমারও লিমিট শেষ হতে পারে। প্রতিটি ধাপের আগে "এখন কী করতে যাচ্ছি" লেখো, শেষ হলেই `[x]` করো। অনেক ধাপ জমিয়ে পরে আপডেট করো না।
5. **অনুমোদনের জন্য অপেক্ষা করবে না** (owner-এর সর্বশেষ সিদ্ধান্ত)। Stage 0 হয়ে গেছে → সরাসরি পরের অসম্পূর্ণ Part-এ যাও। শুধু কঠিন-ফেরানো-যায়-না এমন সিদ্ধান্ত বা নির্দেশনায় দ্বন্দ্ব হলে একটি নির্দিষ্ট প্রশ্ন করো।
6. Part-by-part, নিজে নিজে একটার পর একটা। প্রতিটি Part শেষে: (a) এই ফাইল ও প্ল্যান আপডেট, (b) চ্যাটে অগ্রগতি + CHECKPOINT পোস্ট, (c) প্যাকেজ (এই ফাইল + বদলানো সব ফাইল + ছোট টেস্ট রেজাল্ট) আউটপুট ফোল্ডারে সেভ করে ডেলিভার, (d) সাথে সাথে পরের Part শুরু।
7. চ্যাটে প্রতিটি ধাপের আগে এক লাইন `▶ NOW: ...`, পরে `✔ DONE: ...`। প্রতিটি উত্তরের শেষে **CHECKPOINT** ব্লক (শেষ হয়েছে / বাকি / পরের ধাপ) এবং বর্তমান PLAN checklist (`[ ] / [~] / [x]`) পেস্ট করো।
8. ফাইলে "উপরে যেমন বলেছি" ধরনের রেফারেন্স লিখো না। সিদ্ধান্ত নিলে/কিছু বদলালে সাথে সাথে লগ করো। অনিশ্চিত বিষয় "অনুমান" হিসেবে চিহ্নিত করো।
9. কাজের ওয়ার্কিং কপি: `/home/claude/repo/checkot.github.io-main/` (container রিসেট হলে আপলোড করা zip `checkot_github_io-main (36).zip` থেকে আবার unzip করে "৭. বদলানো ফাইলের তালিকা"-র ফাইলগুলো উপরে বসাও)। ডেলিভারি ফোল্ডার: `/mnt/user-data/outputs/`।

---

# ১. লক্ষ্য ও চূড়ান্ত আউটপুট
- **কী:** রেপোতে কাজ-করা পরিবর্তন: `profile` পেজ (JS/CSS), nav পরিবর্তন, shared attendance function, per-employee history ফাইল (`data/emp/<DEPT>/<ID>.json`) + backfill script + workflow পরিবর্তন, `sw.js` বাম্প, `README.md` আপডেট, `PROFILE_NOTES.md`, স্ক্রিনশট `docs/screens/`।
- **ফরম্যাট:** রেপো-ফাইল সম্পূর্ণ আকারে (বা patch) + প্রতি Part-এ ডাউনলোডযোগ্য প্যাকেজ (zip) + এই হ্যান্ডঅফ ফাইল।
- **ভাষা:** UI লেবেল Bangla+English মিশ্র (অ্যাপের বিদ্যমান স্টাইল), হ্যান্ডঅফ ফাইল Bangla, কোড/কমেন্ট English।
- **শেষে চূড়ান্ত সারাংশ:** কী বদলেছে, present-% এর সঠিক সূত্র, ডেটা-সাইজ প্রভাব, কী স্কিপ হয়েছে।

---

# ২. আমার মূল নির্দেশনা (হুবহু — owner-এর TASK SPEC)

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

# ৩. শর্ত ও সিদ্ধান্ত (কী ঠিক হয়েছে, কেন)

**Owner-এর সিদ্ধান্ত (বদলানো যাবে না):**
- D-O1: Bottom nav হবে ঠিক `Home | Report | Me | Rank | More`। Default landing = Home (Me নিজে খুলবে না)।
- D-O2: VS More-এ যাবে, `#/vs` routable থাকবে, VS চলাকালীন More highlighted।
- D-O3: Short casual/sick leave বলে কিছু নেই; punch ছাড়া কাজের দিন = Absent। "Approved long leave" শুধু `absent.json → longTermLeaves` থেকে `isEmployeeOnApprovedLeave()` দিয়ে, আলাদা কাউন্ট, শুধু non-zero হলে।
- D-O4: কোনো approval-এর জন্য অপেক্ষা নয়; Part-by-part স্বয়ংক্রিয়।
- D-O5: Amount কখনও নতুন করে হিসাব নয় (`totalEarned`, `otAmount`, `holidayAmount`, `nightAmount` পড়ো)।
- D-O6: নতুন লাইব্রেরি/CDN/ফন্ট নয়; কোনো নতুন write/telemetry নয়।

**আমার (AI-এর) সিদ্ধান্ত — Stage 0 থেকে (রেপো যাচাই করে):**
- D-1 **`daily` কলাম ম্যাপ (spec-এর `?` গুলো ঠিক করা):** `r[0]=date 'DD-MON-YYYY'`, `r[1]=dayName`, `r[2]=in`, `r[3]=out`, `r[4]=regular duty`, `r[5]=OT extra`, `r[6]=dayoff duty`, `r[7]=dayoff extra`, `r[8]=holiday duty`, `r[9]=holiday extra`, `r[10]=night flag (0/1)`, `r[11]=shift code (G/DN/…)`। (সূত্র: `_buildEmpDayMap` app-main.js:243 এবং real data `['01-NOV-2026','Sun','07:49','19:32',11.72,0,0,0,0,0,0,'G']`)। Spec-এ `holDuty,holExtra` r[6],r[7] লেখা আছে — আসলে সেগুলো day-off duty; holiday = r[8],r[9]।
- D-2 **Absent লজিক ইতিমধ্যে একটি ফাংশনে আছে:** `_rptRows(ctx)` (js/pages/report.js ~line 25–185), যা `{rows,y,m}` ফেরত দেয়; row-তে `tone`(off/offn/absent/none/bad/req/hol/do/ee), `isApprovedLeave`, `isGeneralAbsent`, `fpPending`, `afterNight`। → Part 2-এ সেটাকে `js/calculations/attendance.js`-এ `computeEmpMonthRows(ctx)` নামে সরাবো (লজিক হুবহু), `report.js`-এর `_rptRows` শুধু সেটাকে কল করবে। Profile একই ফাংশন কল করবে ⇒ দুই জায়গায় একই সংখ্যা।
- D-3 `_rptRows` যেসব global-এর ওপর নির্ভর করে: `_buildEmpDayMap`, `getMonthDatasetMeta` (এটি `monthIndexMemoryCache[ym]` পড়ে — অর্থাৎ ওই মাসের পুরো মাসের ডেটা মেমরিতে লাগে, per-employee ফাইল দিয়ে হবে না!), `isPlantOrGovtHolidayDate` (localStorage-এর PLANT_HOLIDAYS/DAYTYPE_OV পড়ে), `isEmployeeOnApprovedLeave`, `hasPrevMonthLastNight`/`getPrevMonthNightSet`, `isPunchMissing`, `computeEmpEarlyExits`, `resolveEmpAliasId`, `rptIsDayClosed`। **ঝুঁকি:** `consensusHolidays`/`maxActiveDay` মাসের সব কর্মীর `daily` থেকে বের হয়। Option A-তে শুধু একজনের ফাইল থাকলে এটা বের করা যাবে না। **সিদ্ধান্ত:** per-employee ফাইলে `meta[ym] = {maxActiveDay, consensusHolidays[]}` প্রি-কম্পিউট করে রাখা হবে (build script-এ, `getMonthDatasetMeta`-এর হুবহু অ্যালগরিদম), এবং attendance ফাংশন ctx-এ `dsMeta` ইনজেক্ট করা যাবে (না দিলে আগের মতো `getMonthDatasetMeta(ym)`)। একইভাবে `prevNight` (আগের মাসের শেষ দিনে রাত ছিল কিনা) per-employee ফাইলে প্রি-কম্পিউট। এই কারণেই Part 2 ও Part 3 একসাথে ডিজাইন করতে হবে।
- D-4 **Present % সূত্র (চূড়ান্ত):** `present% = presentDays ÷ scheduledDays × 100`, যেখানে `scheduledDays = presentDays + absentDays + approvedLeaveDays` (closed general working days; Thu/Fri, plant/govt holiday, post-night day-off বাদ; `fpPending` দিন বাদ), `presentDays` = ওই মাসের সেই দিনগুলো যাতে In/Out আছে এবং দিনটি scheduled working day (holiday/day-off-এ কাজ করা দিন সংখ্যায় ধরা হবে না, কারণ ওগুলো scheduled নয়)। `scheduledDays = 0` হলে "—"। কর্মী ফাইলে না থাকলে "—"।
- D-5 **Rank** একটি side-drawer পেজ (`page-leaderboard`, left), More-এর পেজগুলো right drawer। Me হবে PERMANENT page (`page-profile`), তাই `switchPage` PERMANENT ব্রাঞ্চে যাবে। `updateNavHighlights()`-এ VS active হলে More highlight দিতে হবে (VS এখনও PERMANENT page থাকবে কিনা: **সিদ্ধান্ত** — `vs` PERMANENT_PAGES-এ থাকবে (রাউটিং/`initVsPage` অক্ষত রাখতে), শুধু `.bn-item` highlight ম্যাপিংয়ে `vs → more`)।
- D-6 `app-main.js` হল লাইভ কোড। `js/admin/admin-core.js` (476 KB) একটি আলাদা bundle যাতে একই নামের ফাংশনের কপি আছে (admin.html-এর জন্য) — **ছোঁয়া যাবে না**; নতুন ফাইল admin.html-এ যোগ করা হবে না (যদি না admin.html একই script শেয়ার করে — Part 1-এ `grep` করে নিশ্চিত করা)।
- D-7 রেপো git নয় (zip) ⇒ "small git commits" সম্ভব নয়; বদলে প্রতি Part-এর প্যাকেজই checkpoint।
- D-8 Month-file সরাসরি লোডে `fetchMonthPreIndexedData(month)` Dept-aware (`getClientDepartment()`; QA হলে `data/qa/<month>.json`)। Per-employee path: `data/emp/<DEPT>/<ID>.json`, DEPT=`PR|QA`।

---

# ৪. প্ল্যান (ছোট ছোট ধাপ) — `[ ]` বাকি / `[~]` চলছে / `[x]` শেষ

**Stage 0**
- [x] 0.1 রেপো পড়া (router, nav, switchPage, report.js, storage, data shape, scripts, workflows)
- [x] 0.2 REPO MAP + PLAN লেখা (এই ফাইল)

**Part 1 — Navigation**
- [x] 1.1 `index.html` bottom-nav: নতুন order + Me বাটন; 1V1 বাটন সরানো; topnav-এ "My Profile"
- [x] 1.2 `page-profile` খালি কন্টেইনার + `css/profile.css` স্টাব + `js/pages/profile.js` স্টাব (empty state with ID input)
- [x] 1.3 `PERMANENT_PAGES`/`VALID_PAGES`/`switchPage`/`updateNavHighlights` (VS→More highlight)
- [x] 1.4 More list-এ VS আইটেম; `css/nav.css` ৫-স্লট ঠিক আছে কিনা দেখা
- [x] 1.5 Playwright smoke: ৫ ট্যাব, #/profile deep-link, back button, VS from More
- [x] 1.6 প্যাকেজ P1

**Part 2 — Calculation layer**
- [x] 2.1 `js/calculations/attendance.js` ← `_rptRows` লজিক হুবহু সরানো (ctx injection: dsMeta, prevNight, helpers)
- [x] 2.2 `report.js` `_rptRows` → shared ফাংশন কল; Report আউটপুট আগের সাথে তুলনা (রিগ্রেশন টেস্ট)
- [x] 2.3 `js/calculations/profile.js` (pure): মাসভিত্তিক aggregation (OT, night, holiday, earned split, present%, avg punch, issues, early exits)
- [x] 2.4 Node টেস্ট (`tests/dump_profile.js`) real `data/*.json` দিয়ে + Python ক্রস-চেক (`tests/crosscheck_profile.py`) — ALL PASS
- [x] 2.5 প্যাকেজ P2

**Part 3 — Data loading**
- [x] 3.1 `scripts/build_emp_history.py` (+ meta[ym], prevNight প্রি-কম্পিউট) ও backfill রান
- [x] 3.2 `to_json.py` / `recompute_from_raw.py` / workflows (`git add data/emp`) পরিবর্তন
- [x] 3.3 Client loader (`profile.js`): Option A → 404 হলে Option B (progressive, localStorage compact extract)
- [x] 3.4 `sw.js` CACHE_NAME বাম্প + precache (emp JSON নয়)
- [x] 3.5 ডেটা-সাইজ পরিমাপ; প্যাকেজ P3

**Part 4 — UI A, B, C** (hero, attendance, monthly income + 👁 toggle)
- [x] 4.0 `js/pages/profile.js` রিরাইট: header, scope chips, `profLoadHistory` ওয়্যারিং, progress বার, skeleton, unknown-ID/error state
- [x] 4.1 Section A (hero: OT, আয়, night, holiday, absent, avg present%, long leave শুধু non-zero হলে)
- [x] 4.2 Section B (attendance + month-wise present% বার + "How is this calculated?")
- [x] 4.3 Section C (SVG stacked bar OT/Holiday/Night + stats + 👁 hide-amounts toggle, localStorage)
- [x] 4.4 Playwright স্মোক (390×844, light+dark) + স্ক্রিনশট + সংখ্যা ক্রস-চেক
- [x] 4.5 প্যাকেজ P4
**Part 5 — UI D, E, F, H** (OT, night, holiday, avg punch) — শেষ
- [x] 5.1 Section D (Total OT: scope মোট, গড়/মাস, month-wise sparkline SVG + সংখ্যা টেক্সটে)
- [x] 5.2 Section E (Night: scope count, month-wise, তারিখ chips; `#shiftDatesDrawer` ব্যবহারযোগ্য কিনা আগে দেখো, না হলে নিজস্ব chips)
- [x] 5.3 Section F (Holiday: count, month-wise, তারিখ chips + duty/extra ঘণ্টা — `holidayDates[]` থেকে)
- [x] 5.4 Section H (Avg In/Out/duty: scope + month-wise টেবিল, ▲▼ আগের মাসের সাথে; night আলাদা — `punch` অবজেক্ট থেকে, `profFmtTime12`)
- [x] 5.5 Playwright স্মোক + স্ক্রিনশট (light/dark) + ক্রস-চেক (avg punch Python-এর সাথে) + প্যাকেজ P5
**Part 6 — UI G + extras I** (issues + "Report to ERP Team" WhatsApp; I-1…I-7 অগ্রাধিকার ক্রমে)  ← পরের ধাপ
- [x] 6.1 Section G: `summ[ym].issues` (requisition/nightSuspects/punchProblems) মাস অনুযায়ী newest-first, summary chips, "All clear ✅", প্রতি আইটেমে "Report to ERP Team" (`team.json`/`openErpSupportModal` WhatsApp লজিক পড়ে পুনর্ব্যবহার, pre-filled বার্তা)
- [x] 6.2 I-1 streak/best month badge + মাসের mini calendar strip (`summ.strip` P/A/L/O/N/B/X)
- [x] 6.3 (I-6 স্কিপড — নিচে D-33) I-2 early-exit (`summ.earlyExits`), I-3 rank (ranking.js), I-4 section avg OT (বেনামী, `area`), I-5 share PNG, I-6 payslip শর্টকাট, I-7 Report লিংক মাস প্রিফিল — সময় অনুযায়ী
- [x] 6.4 স্মোক + স্ক্রিনশট + প্যাকেজ P6
**Part 7 — Verification** ← শেষ (2026-11-14)
- [x] 7.0 MERGED zip + base zip মিলিয়ে ওয়ার্কিং কপি বানানো; পুরনো সব টেস্ট রান: regress_report_rows (1918 employee-months, diffs 0), loader.test, emp_history_equiv (diffs 0), crosscheck_profile/p4/p5/p6/p6b, smoke_p1/p4/report/loader — ALL PASS
- [x] 7.1 `tests/verify_p7.py` — ALL PASS (no-ID, unknown ID, ৫ ট্যাব light/dark, ৪ জন × ১১ সেকশন light/dark, overflow, tap-target, console, back/deeplink/VS, offline SW) → `docs/screens/p7_*` (109টি)
- [x] 7.2 স্ক্রিনশট দেখা (top light/dark, G, G all-clear, C dark, offline): ক্র্যাম্পড/ক্লিপড কিছু নেই; ফিক্স লাগেনি। অফলাইনে year-scope-ও একই সংখ্যা (577h/৳51,542) দেখায় (SW runtime cache emp ফাইল দেয়)
- [x] 7.3 `README.md` আপডেট (feature table-এ My Profile, VS-এর নোট, bottom-nav নোট, project structure: profile.css/attendance.js/profile.js/profile-data.js/data/emp/scripts/tests/docs, "My Profile — data loading" অংশ)
- [x] 7.4 `PROFILE_NOTES.md` লেখা (সূত্র, ডেটা-সাইজ, ভেরিফিকেশন প্রমাণ, সিদ্ধান্ত, স্কিপড)
- [x] 7.5 `sw.js` precache যাচাই (৫টি নতুন asset আছে, emp JSON নেই); CACHE_NAME `profile-p6b` রাখা হয়েছে (P7-এ কোনো অ্যাপ asset বদলায়নি); চূড়ান্ত প্যাকেজ P7
(Part 4–7-এর সাব-ধাপ সেই Part শুরুর সময় এখানে বিস্তারিত লেখা হবে।)

---

# ৫. বর্তমান অবস্থা
- **এই মুহূর্তে (P7 শেষে):** পুরো কাজ সম্পন্ন। সব টেস্ট ALL PASS (`tests/verify_p7.py` সহ)। কোড বদলায়নি Part 7-এ — শুধু `tests/verify_p7.py`, `README.md`, `PROFILE_NOTES.md`, `docs/screens/p7_*`, এই ফাইল।
- **owner-এর হাতে বাকি (AI করতে পারে না):** (১) রিয়েল ফোনে "Share my summary" একবার চালিয়ে PNG দেখা (স্যান্ডবক্সে নেটওয়ার্ক নেই — D-34); (২) রিয়েল GitHub Pages-এ `data/emp/` ডিপ্লয় হয়েছে কিনা ও `empress.yml` রান-এ নতুন ফাইল commit হচ্ছে কিনা দেখা; (৩) চাইলে `#payslipCard` চালু করে তারপর I-6 শর্টকাট (D-33)।
- **স্কিপড (কারণসহ):** "View another employee" (§৬ প্রাইভেসির সাথে সংঘাত), I-3 তিন-মাসের ট্রেন্ড, I-6 payslip শর্টকাট — বিস্তারিত `PROFILE_NOTES.md` §৬।
---
## (পুরনো) Part 5 শেষের অবস্থা
- **এই মুহূর্তে:** Part 5 শেষ; পরের AI সরাসরি 6.1 থেকে।
- **শেষ কী করেছি (Part 5):** `js/pages/profile.js`-এ `_pfSectionD/E/F/H` + হেল্পার (`_pfMiniBars` SVG বার + সংখ্যা চার্টেই, `_pfChips` তারিখ চিপ, `_pfDutySection` Night/Holiday-র সাধারণ রেন্ডার)। D: OT (স্কোপ/গত মাস বা বছর/গড় + মাসওয়ারি বার); E: Night (গণনা + মাসওয়ারি তারিখ চিপ); F: Holiday (চিপে duty+extra ঘণ্টা); H: গড় In/Out/duty (দিনের শিফট), রাতের শিফট আলাদা নোট, মাসওয়ারি টেবিল + duty ▲▼। `css/profile.css`-এ `.prof-kv3/.prof-dchip/.prof-dlist/.prof-ptable`।
- **টেস্ট:** `python3 tests/crosscheck_p5_page.py` — ৫ জন (৪ PR + ১ QA) এর বছরের OT, night, holiday, চিপ সংখ্যা (= nightDays/holidayDays দৈর্ঘ্য), avg In/Out পেজ ⇄ স্বাধীন Python: ALL PASS; overflow-x নেই; স্ক্রিনশট `docs/screens/p5_*`। P4 টেস্ট অপরিবর্তিত।
- **পরের ধাপ:** Part 6 (§৪)। `profile.js`-এ `_pfSectionG()` লিখে `_pfRenderDynamic()`-এ H-এর পরে বসাও। WhatsApp: আগে `team.json` ও `openErpSupportModal` (app-main.js ~2669) পড়ো।

---

# ৬. REPO MAP

**উদ্দেশ্য:** RENATA PLC Production Factory (RPPF) কর্মীদের Overtime/Night/Holiday রিপোর্ট, লিডারবোর্ড, VS তুলনা, payslip estimator, in-charge ড্যাশবোর্ড। PR ও QA দুই ডিপার্টমেন্ট।
**টেক স্ট্যাক:** vanilla HTML/CSS/JS (ফ্রেমওয়ার্ক নেই), global-scope ফাংশন (ES modules নয়, `<script>` ট্যাগের ক্রমে লোড), Firebase compat (presence/telemetry), GitHub Pages, Service Worker PWA, ডেটা বিল্ড Python (openpyxl) GitHub Actions-এ।
**চালানো:** `cd <repo> && python3 -m http.server 8000` → `http://localhost:8000/`। বিল্ড-স্টেপ নেই। **টেস্ট:** আগে কোনো টেস্ট নেই; নতুন Node টেস্ট `node tests/profile.test.js` (Part 2-এ তৈরি হবে)।

**ফোল্ডার কাঠামো:**
- `index.html` — একটিই SPA শেল, সব `<div class="page" id="page-X">`; bottom-nav ~line 225; topnav ~line 201; More পেজ `#page-more` ~line 1557; CSS লিংক line 46–56; script লিস্ট line 1916–1945 (ক্রম গুরুত্বপূর্ণ)।
- `admin.html` + `js/admin/*` — অ্যাডমিন প্যানেল (admin-core.js 476 KB আলাদা bundle, **ছোঁয়া যাবে না**)।
- `css/` — `tokens.css` (ডিজাইন টোকেন, dark/light), `base.css`, `components.css`, `nav.css` (top/bottom nav), `pages.css`, `manager-ux.css`, `rank-details.css`, `fit.css`, `modern-top.css`, `rank-loader.css`, ইত্যাদি।
- `js/core/` — `config.js` (Firebase, REPO_NAME, STORAGE_NAMESPACE, dept config), `state.js` (global let/const: currentPermanentPage, currentSideDrawerPage, _monthInflight…), `storage.js` (`getPreferredId`/`setPreferredId` — key `PREFERRED_ID_KEY`; setPreferredId ডিপার্টমেন্টও সেট করে), `utils.js`, `access-*.js`।
- `js/calculations/` — `rates.js` (OT/holiday/night রেট ইঞ্জিন), `early-exit.js` (`computeEmpEarlyExits`), `ranking.js`।
- `js/components/` — `router.js` (hash router: `VALID_PAGES`, `parseHash`, `getHashForPage`, `onPageSwitched`; UMD), `loader.js`, `rank-loader.js`, `rank-details.js`, `presence-board.js`, `telemetry.js`, `pwa-install.js`।
- `js/pages/` — `search.js` (Home), `report.js` (`_rptRows`, `_rptHtml`, `downloadReportPNG`, `rptIsDayClosed`), `vs.js`, `leaderboard.js` (+ `viewEmployeeFromLeaderboard`), `more.js`, `team.js`, `history.js`, `settings.js`, `notices.js`, `assessment.js`।
- `js/app-main.js` (275 KB, লাইভ কোর): boot; `getMonthDatasetMeta` (:76), `isPlantOrGovtHolidayDate` (:136, hardcoded govt holidays + localStorage overrides), `_buildEmpDayMap` (:243), `fetchMonthPreIndexedData` (:950; ডিপার্টমেন্ট-অনুযায়ী `data/<m>.json` বা `data/qa/<m>.json`, `monthIndexMemoryCache`, `persistMonthCache` localStorage-এ `daily` বাদ দিয়ে), `PERMANENT_PAGES`/`MORE_PAGES` (:1513), `switchPage` (:1549), `updateNavHighlights` (:1533), `openModeSetupModal` (:491), `openErpSupportModal` (:2669), `isEmployeeOnApprovedLeave` (:6018)।
- `js/patches/manager-ux.js` — in-charge/manager UX প্যাচ (60 KB)।
- `data/YYYY-MM.json` (2025-12…2026-11; `{month, updatedAt, employees[]}` PR), `data/qa/YYYY-MM.json` (এখন শুধু 2026-11, 72 জন), `data/latest.json`, `data/*.raw.json` (raw আর্কাইভ); মোট `data/` ≈ 37 MB, Oct = 6.4 MB।
- `absent.json` (`longTermLeaves`), `areas.json`, `team.json` (ERP টিম WhatsApp), `access.json`, `notices.json`, `shift-rules.json`, `manifest.json`, `sw.js` (CACHE_NAME `checkot-pwa-v20261113-ee-v5`, PRECACHE_ASSETS লিস্ট, stale-while-revalidate)।
- `scripts/` — `to_json.py` (Excel→`data/*.json`, `build_month()` :917, `main()` :997), `recompute_from_raw.py`, `fetch_empress.py`, `analyze_punch.py`, `fetch_notices.py`। `.github/workflows/`: `empress.yml` (দৈনিক fetch → `to_json.py` → `git add data/*.json`), `recompute-from-raw.yml`, `manual-excel.yml`, `deploy-zip.yml`, `update-notices.yml`।

**ডেটা/কন্ট্রোল ফ্লো:** boot → `app-main.js` → ID/মাস সিলেক্ট → `fetchMonthPreIndexedData(month)` → `monthIndexMemoryCache[month]` (normalized employees, `_buildEmpDayMap` দিয়ে `activeDayNums` সেট) → `findReport()` → `currentResult` → `switchPage('report')` → `initReportPage()` → `_rptHtml(ctx)` → `_rptRows(ctx)`। Router: `switchPage(page)` → `Router.onPageSwitched` → hash push; hash বদলালে `activateRoute` → `switchPage(page, true, true)`। Side-drawer পেজ (leaderboard বাম; more+MORE_PAGES ডান) permanent পেজের ওপরে খোলে।

**কোডিং কনভেনশন / যা ভাঙা যাবে না:** global ফাংশন (নাম বদলানো যাবে না); HTML-escape হেল্পার (`_rE`, `esc`); `bn()` বাংলা সংখ্যা; CSS টোকেন (`var(--brand)`, `--surface-2`, `--border`…); dark theme `data-theme`; `body.nav-scroll-hidden`; safe-area insets; ID alias (`CL6515↔556515`, `CL6531↔556531`); ডিপার্টমেন্ট আইসোলেশন (`getClientDepartment()`); কোনো নতুন Firebase write নয়; rates/leaderboard/admin/access-control অপরিবর্তিত।

**এখনও ছোঁয়া হয়নি (পড়া/বদলানো):** সব ফাইল (Stage 0-এ শুধু উপরে উল্লিখিত অংশগুলো পড়া হয়েছে)। বিশেষ করে এখনও পড়া হয়নি: `css/nav.css`, `css/tokens.css`, `js/calculations/early-exit.js`, `ranking.js`, `team.js`/`openErpSupportModal` WhatsApp লজিক, `isEmployeeOnApprovedLeave`, `getPrevMonthNightSet`, `index.html`-এ payslip মোডাল, `#shiftDatesDrawer`।

---

# ৭. বদলানো/তৈরি ফাইলের তালিকা
(এখনও কিছু বদলানো হয়নি। প্রতিটি এন্ট্রির পাশে থাকবে: "এটাই সর্বশেষ ভার্সন, রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো।")

| পথ | কী বদলেছে | অবস্থা |
|---|---|---|
| `index.html` | bottom-nav নতুন order + Me; topnav My Profile; `#page-profile`; More-এ VS আইটেম; `css/profile.css` ও `js/pages/profile.js` রেজিস্টার | সম্পূর্ণ (সর্বশেষ ভার্সন; রেপোর পুরনো ফাইলের বদলে এটা ব্যবহার করো) |
| `js/components/router.js` | `VALID_PAGES`-এ `profile` | সম্পূর্ণ (সর্বশেষ ভার্সন; পুরনোর বদলে এটা ব্যবহার করো) |
| `js/app-main.js` | `PERMANENT_PAGES`-এ `profile`; `updateNavHighlights` (VS→More); `switchPage`-এ `initProfilePage()` কল | সম্পূর্ণ (সর্বশেষ ভার্সন; পুরনোর বদলে এটা ব্যবহার করো) |
| `sw.js` | CACHE_NAME `checkot-pwa-v20261114-profile-p1`; precache-এ `css/profile.css`, `js/pages/profile.js` | সম্পূর্ণ (সর্বশেষ; Part 3-এ আবার বাড়বে) |
| `css/profile.css` | নতুন: কার্ড/empty-state/বাটন/`.mi-vs-box` স্টাইল | আংশিক (সেকশন-স্টাইল পরের Part-এ যোগ হবে) |
| `js/pages/profile.js` | নতুন: `initProfilePage()`, empty state, placeholder | আংশিক (সেকশন A–I পরের Part-এ) |
| `tests/smoke_p1.py` (+ `docs/screens/p1_*.png`) | Playwright smoke টেস্ট ও স্ক্রিনশট | সম্পূর্ণ |
| `js/calculations/attendance.js` | নতুন: `computeEmpMonthRows(ctx)`, `rptIsDayClosed` | সম্পূর্ণ (সর্বশেষ) |
| `js/pages/report.js` | `_rptRows` → `computeEmpMonthRows` কল; `rptIsDayClosed` সরানো | সম্পূর্ণ (সর্বশেষ; পুরনোর বদলে এটা ব্যবহার করো) |
| `index.html` / `sw.js` | attendance.js script ট্যাগ (early-exit.js-এর পর) ও precache | সম্পূর্ণ (সর্বশেষ) |
| `js/calculations/profile.js` | নতুন pure aggregation (D-4 সূত্র ফাইলের হেডারে লেখা) | সম্পূর্ণ (সর্বশেষ) |
| `tests/dump_profile.js`, `tests/crosscheck_profile.py` | Node dump + Python স্বাধীন ক্রস-চেক | সম্পূর্ণ |
| `scripts/build_emp_history.py` | নতুন: per-employee history বিল্ডার | সম্পূর্ণ (সর্বশেষ) |
| `data/emp/PR/*.json`, `data/emp/QA/*.json` | জেনারেটেড (backfill) — ১২৮৫ ফাইল | সম্পূর্ণ; প্যাকেজে শুধু নমুনা ৩টি, পুরোটা `python3 scripts/build_emp_history.py` দিয়ে আবার বানানো যায় |
| `scripts/to_json.py`, `scripts/recompute_from_raw.py` | শেষে build_emp_history হুক | সম্পূর্ণ (সর্বশেষ) |
| `.github/workflows/empress.yml`, `recompute-from-raw.yml`, `manual-excel.yml` | `git add -A data/emp` যোগ | সম্পূর্ণ (সর্বশেষ) |
| `js/pages/profile-data.js` | নতুন লোডার (Option A/B) | সম্পূর্ণ (সর্বশেষ) |
| `tests/emp_history_equiv.js`, `tests/loader.test.js`, `tests/smoke_loader.py` | Option A/B সমতা + লোডার টেস্ট | সম্পূর্ণ |
| `js/pages/profile.js` (Part 4) | সম্পূর্ণ রিরাইট: header/chips/loader/A/B/C (`_pf*` ফাংশন-প্রিফিক্স; পুরনো `_pE`, `_profMyId`, `_profRenderEmpty`, `initProfilePage` অক্ষত নাম) | আংশিক (D–I পরের Part-এ); এটাই সর্বশেষ ভার্সন |
| `css/profile.css` (Part 4) | header/chips/skeleton/hero/attendance/chart/hide-amounts স্টাইল যোগ | আংশিক; সর্বশেষ ভার্সন |
| `js/pages/profile-data.js` (Part 4) | ছোট সংশোধন: primary মাসে কর্মী `null` হলে এবং emp-ফাইলে থাকলে emp-ফাইল ব্যবহার (D-24) | সম্পূর্ণ; সর্বশেষ |
| `index.html` / `sw.js` (Part 4) | cache-buster `?v=20261114p4` (profile.css/profile.js/profile-data.js); `CACHE_NAME` = `checkot-pwa-v20261114-profile-p4` | সর্বশেষ |
| `tests/smoke_p4.py`, `tests/crosscheck_p4_page.py` | Part 4 স্মোক + পেজ⇄Python ক্রস-চেক | সম্পূর্ণ |
| `docs/screens/p4_*.png` | A/B/C স্ক্রিনশট (light/dark/hidden), unknown-ID | সম্পূর্ণ |
| `js/pages/profile.js` / `css/profile.css` (Part 5) | সেকশন D/E/F/H + স্টাইল যোগ | আংশিক (G, I বাকি); সর্বশেষ ভার্সন |
| `index.html` / `sw.js` (Part 5) | cache-buster `p5`; `CACHE_NAME` `checkot-pwa-v20261114-profile-p5` | সর্বশেষ |
| `tests/crosscheck_p5_page.py`, `docs/screens/p5_*.png` | D/E/F/H পেজ⇄Python চেক + স্ক্রিনশট | সম্পূর্ণ |
| `tests/verify_p7.py`, `docs/screens/p7_*.png` (Part 7) | চূড়ান্ত end-to-end ভেরিফিকেশন + ১০৯টি স্ক্রিনশট | সম্পূর্ণ |
| `README.md`, `PROFILE_NOTES.md` (Part 7) | ফিচার টেবিল/স্ট্রাকচার আপডেট; সূত্র-সিদ্ধান্ত-সাইজ-স্কিপড নোট | সম্পূর্ণ (সর্বশেষ) |
| `tests/_harness.js`, `tests/regress_report_rows.js`, `tests/smoke_report.py` | Node vm harness (app-main.js থেকে নাম ধরে ফাংশন extract), রিগ্রেশন, Report smoke | সম্পূর্ণ |

---

# ৮. পরের ধাপে পড়ার ফাইল (শুধু নাম)
Part 5 এর জন্য: `js/pages/profile.js` (`_pf` স্টেট, `_pfSectionA/B/C`, `_pfRenderDynamic`), `js/calculations/profile.js` (`computeProfileMonth` আউটপুট: `punch`, `nightDates`, `holidayDates`), `css/profile.css`, `index.html` (`#shiftDatesDrawer` মার্কআপ — 5.2-এ চিপ পুনর্ব্যবহার সম্ভব কিনা দেখতে)। পুরনো Part 2-এর তালিকা নিচে:
Part 2 এর জন্য: `js/pages/report.js` (লাইন ~25–185 `_rptRows`, `rptIsDayClosed`), `js/app-main.js` (:60–135 `getPrevMonthNightSet`/`hasPrevMonthLastNight`/`getMonthDatasetMeta`, :6018 `isEmployeeOnApprovedLeave`), `js/calculations/early-exit.js`, `absent.json`, `data/2026-11.json` (নমুনা), `js/pages/profile.js`।

---

# ৯. পরিচিত সমস্যা, অনুমান, এবং যা করা যাবে না
- **ঝুঁকি R1:** `getMonthDatasetMeta` ও `prevNight` পুরো মাসের ডেটা চায় → per-employee ফাইলে প্রি-কম্পিউট করতে হবে (D-3)। Option B-তে মাসের পুরো ফাইল আসে তাই সরাসরি কাজ করে।
- **ঝুঁকি R2:** `isPlantOrGovtHolidayDate` browser localStorage-এর overrides পড়ে ও hardcoded 2026 তালিকা ব্যবহার করে — Node টেস্টে stub/ইনজেক্ট করতে হবে।
- **অনুমান A1:** present day = In/Out আছে এমন scheduled working day (D-4)। Owner ভিন্ন চাইলে বদলাবে।
- **অনুমান A2:** QA-এর শুধু 2026-11 ডেটা আছে ⇒ QA প্রোফাইলে ১ মাসের ডেটা (edge case হিসেবে টেস্ট)।
- **অনুমান A3:** `data/emp/` ফাইল GitHub Pages-এ সার্ভ হবে; ~1000+ ছোট ফাইল (PR ~1082 + QA ~72)।
- **করা যাবে না:** rates/leaderboard/admin/access-control বদলানো; ফাংশন/ID রিনেম; নতুন লাইব্রেরি/CDN/ফন্ট; নতুন Firebase write/telemetry; `js/admin/admin-core.js` বদলানো; `emp` JSON precache করা।

---

# CHANGELOG / DECISION LOG (নতুন এন্ট্রি নিচে যোগ করো)
- 2026-11-14 Part 7: D-35 চূড়ান্ত ভেরিফিকেশন `tests/verify_p7.py` ALL PASS (৪ জন × ১১ সেকশন × light/dark, ৫ ট্যাব, no-ID, unknown ID, back/deeplink/VS, offline SW)। ফল: কোনো UI ফিক্স লাগেনি। অফলাইনে year-scope কাজ করে (SW runtime cache `data/emp` ফাইল দেয়; localStorage ব্যবহার হয় না Option A-তে)।
- 2026-11-14 Part 7: D-36 "View another employee" (optional) **স্কিপড**: §5 প্রাইভেসি ("শুধু saved ID-র নিজের ডেটা") ও §2 "only if cheap"-এ সংঘাত; in-charge-এর জন্য `viewEmployeeFromLeaderboard` আগে থেকেই আছে। Part 1–6-এ লগ হয়নি, এখানে লগ করা হলো।
- 2026-11-14 Part 7: D-37 ডেটা-সাইজ পরিমাপ: spec-এর "≈40 MB" আসলে unzipped; gzip-এ ১২ মাস ≈ 3.0 MB (২০২৬-এর ১১ মাস ≈ 2.7 MB)। Option A: গড় 20.8 KB raw / 3.8 KB gzip, সর্বোচ্চ 34.5 KB / 5.8 KB; `data/emp` = ১২৮৫ ফাইল (PR ১২১৩ + QA ৭২), ২৭.৪ MB রেপো-স্পেস।
- 2026-11-14 Part 7: D-38 tap-target চেকে `.theme-toggle` (48×26) বাদ — এটা অ্যাপের বিদ্যমান গ্লোবাল হেডার কন্ট্রোল (মূল index.html-এও আছে), এই ফিচারের নয়; বদলানো হয়নি। unknown-ID-তে `data/emp/...` 404 কনসোলে আসে — এটা নকশা-অনুযায়ী Option B ফলব্যাক, আসল error নয়।
- 2026-11-14 Part 7: D-39 spec-এর টেস্ট-ডেটা যাচাই: 556490 নভেম্বরে requisition 5 + punch 2 (ফাইলে ও G সেকশনে মিলেছে)।
- 2026-11-14 Part 6: D-32 I-3/I-4 একটি কার্ডে `_pfSectionI3`: সেকশন = ডেটার `area` ফিল্ড (অ্যাপের নিজস্ব সেকশন: PR-এ Packing Hall/Solid/Softgel/Overall; Packing Hall = ৮৯৭ জন), র‍্যাঙ্ক = OT ঘণ্টায় (`1 + আমার চেয়ে বেশি OT-ওয়ালা সংখ্যা`), গড় বেনামী; ৫ জনের কম হলে গড় লুকানো, অন্যের নাম/ID কখনও নয়। মাস-ফাইল ক্যাশে না থাকলে "Show my rank" বাটনে একবার লোড (বড় ফাইল)। ৩-মাসের ট্রেন্ড **স্কিপড** (৩টি বড় ফাইল লাগত)। মাস স্কোপে নির্বাচিত মাস, বছর স্কোপে চলতি মাস। টেস্ট `tests/crosscheck_p6b_page.py` ALL PASS (৪ জন)। "Open Rank" → leaderboard পেজ।
- 2026-11-14 Part 6: D-33 I-6 **স্কিপড**: payslip কার্ড (`#payslipCard`) লাইভ কোডে কোথাও দৃশ্যমান করা হয় না (শুধু পুরনো `admin-core.js` কপিতে `display='block'` আছে), তাই শর্টকাট বাটন কাজ করত না; ডেড বাটন বাদ দেওয়া হয়েছে। চাইলে owner আগে payslip কার্ড চালু করবে, তারপর শর্টকাট।
- 2026-11-14 Part 6: D-34 I-5 share image (`_pfShareSummary`) report-এর `downloadReportPNG` পদ্ধতি পুনর্ব্যবহার করে (html2canvas cdnjs থেকে lazy-load, যেমন Report পেজ করে — নতুন CDN নয়)। 👁 hide চালু থাকলে ছবিতে টাকা বাদ। **স্যান্ডবক্সে নেটওয়ার্ক নেই বলে প্রকৃত PNG তৈরি পরীক্ষা হয়নি**: শুধু কার্ড HTML ও ব্যর্থতার পথ (toast, error নেই, অস্থায়ী box মুছে যায়) যাচাই। রিয়েল ডিভাইসে একবার দেখে নিতে হবে। `.prof-links` wrap করে।
- 2026-11-14 Part 6: D-31 I-2 `_pfSectionI2` (H-এর পরে, G-র আগে): স্কোপে মোট early exit + মাসওয়ারি (শুধু non-zero)। I-7: `Open daily report` এখন `yearSelect/monthSelect` প্রিফিল করে (month scope = নির্বাচিত মাস, year scope = চলতি মাস); যাচাই: Last month চিপ → `#/report?id=CF2170&month=2026-10`। ক্যালেন্ডারে আজকের পরের দিন `·` (pending) দেখায়, BD সময়ে। বাকি I-3/I-4/I-5/I-6 অনুরোধ অনুযায়ী পরের ধাপে; I-3/I-4 অন্য কর্মীর ডেটা লাগে (পুরো মাস-ফাইল) তাই বেনামী/গোপনীয়তা ও ডেটা-সাইজ ভেবে করতে হবে।
- 2026-11-14 Part 6: D-29 Section G (`_pfSectionG`) H-এর পরে বসানো; স্কোপের মাসগুলো newest-first, প্রথম মাস খোলা, বাকি `<details>`। প্রতি আইটেম + মাসওয়ারি "Report all" বাটন `openErpSupportModal(msg, area)` ব্যবহার করে (বার্তা `_pfBuildErpMessage`)। টেস্ট `tests/crosscheck_p6_page.py` ALL PASS (৫ জন)। `.prof-btn-ghost/primary:hover` কনট্রাস্ট ফিক্স। cache-buster `p6`, CACHE_NAME `profile-p6`।
- 2026-11-14 Part 6: D-30 I-1 `_pfSectionI1` (B-এর পরে): streak = শেষ মাস থেকে পিছনে একটানা present%=100 মাস; best = সর্বোচ্চ present% (সমান হলে নতুন মাস); ক্যালেন্ডার month-scope-এ নির্বাচিত মাস, year-scope-এ সর্বশেষ মাস; প্রতি ঘরে অক্ষর (P/A/L/O/N/B/·) যাতে শুধু রং-নির্ভর না হয়।
- 2026-11-14 P5 অডিট (নতুন চ্যাট): P1–P5 মার্জ করে যাচাই — regress_report_rows (1918 employee-months, diffs 0), loader.test, emp_history_equiv (diffs 0), crosscheck_p5_page ALL PASS। প্ল্যানের 2.1/2.2 চেকবক্স পুরনো `[ ]` ছিল, আসলে সম্পন্ন — `[x]` করা হয়েছে। বাকি: Part 6 (G + I), Part 7 (README, PROFILE_NOTES.md, চূড়ান্ত ভেরিফিকেশন)। এই MERGED প্যাকেজই এখন একমাত্র সোর্স; আলাদা P1–P5 জিপ আর লাগবে না।
- 2026-11-14 Part 5: D-28 H-এর duty ▲▼ রং নিরপেক্ষ-অর্থে (বেশি = amber, কম = green) শুধু সূচক; ভালো/খারাপ বলা হয়নি। রাতের শিফটের গড় দিনের গড় থেকে আলাদা নোটে। D/E/F-এর "Last month" কার্ড বছর-স্কোপে চলতি-থেকে-আগের মাস, মাস-স্কোপে "This year" দেখায়।
- 2026-11-14 Part 4: D-22 👁 hide-amounts বাটন header-এ (সব ৳ ঢাকে — hero সহ) এবং Section C-র কার্ডেও আছে; দুটোই একই `localStorage <ns>rppf_prof_hide`। টাকার সব স্প্যান/SVG লেবেলে `.prof-amt` ক্লাস (blur)। নতুন টাকা দেখানো কোডে `_pfAmt()` ব্যবহার করতে হবে।
- 2026-11-14 Part 4: D-23 Scope chips overflow-scroll বদলে wrap (চতুর্থ চিপ ডানে কাটা পড়ছিল)। "This year" = BD-সময়ের বর্তমান বছরের জানুয়ারি…চলতি মাস; Dec 2025 শুধু Pick month থেকে। Month-wise তালিকা/চার্ট সবসময় নির্বাচিত স্কোপের পুরো বছর দেখায় (month scope-এ নির্বাচিত মাস হাইলাইট)।
- 2026-11-14 Part 4: D-24 **বাগ ফিক্স:** অ্যাপের `monthIndexMemoryCache` ডিপার্টমেন্ট-ভিত্তিক নয়; PR হিসেবে বুট করে Me-তে QA ID সেভ করলে primary মাসে PR তালিকা আসে → কর্মী `null`, "ID not found" দেখাচ্ছিল। এখন primary `null` হলে ও emp-ফাইলে (পাথেই dept আছে) থাকলে emp-ফাইল ব্যবহার। Option B-তে একই ধরনের stale-dept মেমরি-ক্যাশের ঝুঁকি থেকে যায় (অনুমান A5: বাস্তবে dept বদলালে অ্যাপ `clearDepartmentCaches` চালায়; সম্পূর্ণ নিশ্চিত নয়)।
- 2026-11-14 Part 4: D-25 চলতি মাসে রেকর্ড না থাকলে (যেমন CF2990, শুধু আগের মাসে ছিল) "This month" কার্ডে "No record" দেখায়, স্কোপ নিজে বদলায় না (owner সিদ্ধান্ত ছাড়া auto-switch করা হয়নি)। চাইলে পরে ছোট পরিবর্তন।
- 2026-11-14 Part 4: D-26 Section C-তে ▲▼ তুলনায় সর্বশেষ মাস চলতি (অসম্পূর্ণ) হলে "· month still running" লেখা হয়, যাতে আংশিক মাসকে ভুল পতন ভাবা না হয়। Best month/Avg-এ চলতি মাসও ধরা হয় (সব মাসের `totalEarned` যেমন ফাইলে আছে)।
- 2026-11-14 Part 4: D-27 Month scope-এ Section B-র "Absent days" ও Hero-র "Absent" একই `computeEmpMonthRows` থেকে (Report-এর সাথে একই ফাংশন); মাসের মাঝে যোগ দেওয়া কর্মীর আগের দিনগুলো Absent ধরা বিদ্যমান Report আচরণ (A4), যেমন 556490-এর জুলাই 45%।
- 2026-11-14 Part 3: D-18 Option B-তে current (বন্ধ-না-হওয়া) মাস সবসময় `fetchMonthPreIndexedData` দিয়ে (সেশনে একবার ফ্রেশ; spec-এর "updatedAt বদলালে refetch"-এর সরল রূপ), closed মাস localStorage compact cache থেকে, কখনও refetch নয়।
- 2026-11-14 Part 3: D-19 primary মাস সবসময় মাস-ফাইল (ফ্রেশ) থেকে; emp-ফাইল থেকে শুধু তার `prevNight` সংশোধন (`revision` কলব্যাক)। QA-তে আগের মাসের ফাইল না থাকলে (404) "কোনো রেকর্ড নেই" ধরা হয়।
- 2026-11-14 Part 3: D-20 `meta` লজিকের কপি ৩টি (app-main.js, build_emp_history.py, profile-data.js) — সমতা টেস্টে আটকানো; app-main.js-এর লজিক বদলালে তিনটিই বদলাতে হবে।
- 2026-11-14 Part 3: D-21 emp ফাইলে `fileName` ফিল্ড বাদ; ফাইলনাম = ID uppercase (non-alnum → `_`)। Alias (CL6515↔556515) ক্লায়েন্ট দুটি নামই চেষ্টা করে।
- 2026-11-14 Part 2: D-15 present-day গণনা: সারিতে In+Out আছে, pending নয়, এবং (regular duty/OT>0 অথবা day-off/holiday duty নেই)। শুধু day-off/holiday কলামে duty থাকলে scheduled নয়। এক punch missing (`missIn/missOut`) সারি scheduled-এর দুই দিকেই বাদ (punch problem)। Approved leave Thu/Fri-তে পড়লে গণনায় নয় (শুধু Thu/Fri — plant holiday আলাদা করে ধরা হয় না, কারণ attendance.js লজিক বদলানো যাবে না)। Year-level present% = pooled (Σpresent ÷ Σscheduled), mean-of-means নয়।
- 2026-11-14 Part 2: D-16 Avg punch: দিনের শিফট In/Out সরল গড় (মিনিট); night সারি (r[10] বা shift DN/NIGHT) আলাদা (circular mean, মধ্যরাত পার হলেও ঠিক); Out≤In দিনের-শিফট সারি বাদ। "Avg duty hours" = r[4]+r[6]+r[8] (OT বাদ) এর গড় পাঞ্চ-সম্পূর্ণ দিনে।
- 2026-11-14 Part 2: D-17 Issues (G) ফাইলের `requisitionProblems/nightSuspects/punchProblems` অ্যারে থেকে (spec অনুযায়ী); Report-এর রো-ভিত্তিক ফ্ল্যাগ থেকে নয়।
- 2026-11-14 Part 2: অনুমান A4 — মাসের মাঝে যোগ/ছাড়া কর্মীর ক্ষেত্রে Report লজিক আগের দিনগুলোকে Absent ধরে (যেমন CF2990: ১ মাস, present 30%); এটা বিদ্যমান Report আচরণ, বদলানো হয়নি।
- 2026-11-14 Part 2: D-13 `rptIsDayClosed` report.js থেকে attendance.js-এ সরানো (attendance.js report.js-এর আগে লোড হয়; leaderboard.js একই global নাম কল করে, অপরিবর্তিত)। attendance.js-এ আলাদা prefix-ওয়ালা const (`_ATT_MON/_ATT_DAY/_attMin`) যাতে classic-script global redeclare error না হয়।
- 2026-11-14 Part 2: D-14 Node harness `app-main.js` থেকে ফাংশন নাম ধরে extract করে (regex-এ quote থাকলে scanner ভাঙে — `cleanPunchValue` harness-এ হাতে লেখা)।
- 2026-11-14 Stage 0: রেপো পড়া শেষ, D-1…D-8 লিপিবদ্ধ, প্ল্যান তৈরি।
- 2026-11-14 Part 1: D-9 desktop topnav-এ VS (1v1) বাটন রাখা হয়েছে (`#page-more` desktop-এ `display:none` তাই More-এ VS নেই; spec-এর "move to More" শুধু mobile bottom-nav-এর জন্য)। My Profile বসেছে Report-এর পরে।
- 2026-11-14 Part 1: D-10 `vs` PERMANENT_PAGES-এই থাকল; bottom-nav highlight ম্যাপে `vs→more`; topnav highlight অপরিবর্তিত (VS বাটন নিজেই active)।
- 2026-11-14 Part 1: D-11 নতুন ইউজারে প্রথমবার খোলায় অ্যাপের "RPPF — User Login" মোডাল স্বয়ংক্রিয় খোলে (বিদ্যমান আচরণ, অপরিবর্তিত); ✕ চাপলে Me-তে empty state দেখা যায়।
- 2026-11-14 Part 1: D-12 `sw.js` precache-এ নতুন CSS/JS এখনই যোগ ও CACHE_NAME বাম্প করা হয়েছে (পরিকল্পনায় 3.4 ছিল) যাতে অফলাইনে 404 না হয়; 3.4-এ আবার বাম্প হবে।
- Smoke ফলাফল (Playwright 390×844): ৫ ট্যাব সঠিক order; Me→`#/profile`, aria-current ঠিক; Me→Report→Back আবার Me; More→VS→`#/vs` ও More highlighted; `#/profile` cold deep-link কাজ করে; desktop topnav-এ My Profile। Console-এ শুধু sandbox-এ নেটওয়ার্ক-অনুপস্থিত বহিঃসম্পদ ও টেস্টে SW ব্লক — আমাদের কোডের কোনো error নেই।
