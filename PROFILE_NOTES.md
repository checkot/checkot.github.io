# PROFILE_NOTES.md — "Me" (My Profile) page

Last updated 2026-11-14 · Parts 1–7 complete.
কী বানানো হয়েছে, কেন, কোন সূত্রে হিসাব, ডেটা-সাইজ কত, আর কী স্কিপ করা হয়েছে — সব এখানে।

---

## 1. What changed (summary)

| Area | Change |
|---|---|
| Navigation | Mobile bottom nav is now `Home \| Report \| Me \| Rank \| More`. `1V1` left the bottom nav and lives in **More** (`#/vs` still routable; **More** is highlighted while VS is open). Desktop top-nav gets **My Profile** after Report. Hash: `#/profile`. Default landing stays Home. |
| New page | `#page-profile` — header, scope chips (This month / Last month / This year / Pick month), then sections A–I below. |
| Shared logic | Absent/Leave/Off logic moved **verbatim** from `report.js` `_rptRows` into `js/calculations/attendance.js` → `computeEmpMonthRows(ctx)`. Report and Profile both call it, so the numbers cannot diverge. |
| Aggregation | `js/calculations/profile.js` — pure (no DOM), unit-testable from Node. |
| Data loading | `js/pages/profile-data.js` — Option A (per-employee file) with automatic Option B fallback. |
| Build | `scripts/build_emp_history.py` (backfill + used by `to_json.py` / `recompute_from_raw.py`); 3 workflows commit `data/emp`. |
| PWA | `sw.js` precaches the new JS/CSS only. `data/emp/*` is **not** precached (served by the existing stale-while-revalidate runtime cache). |

Not touched (as required): rates/allowance engine, leaderboard behaviour, admin panel (`admin-core.js`), access control, Firebase writes/telemetry.

---

## 2. Formulas

**Present % (exact):**

```
scheduledDays = presentDays + absentDays + approvedLongLeaveDays
present%      = presentDays / scheduledDays × 100        (scheduledDays = 0  →  "—")
```

* *Scheduled* = closed, general working days. Excluded: Thu/Fri weekly off, plant/government holidays, the post-night day-off, and days not yet closed (`rptIsDayClosed`; the current month is labelled "so far").
* *Present* = a scheduled day with both In and Out. Working on a holiday/day-off does **not** add to present (those days are not scheduled).
* A day with only one punch (`missIn/missOut`) is a punch problem and is excluded from both sides.
* *Approved long leave* (`absent.json → longTermLeaves`, via `isEmployeeOnApprovedLeave()`) counts as **not present** but is shown separately, and only when non-zero. There is no short casual/sick leave: a working day without a punch is **Absent**.
* A month where the employee does not exist in the file shows "—", never 0%.
* **Year %** is pooled (Σ present ÷ Σ scheduled), not a mean of monthly percentages.

**Average punch (H):** day-shift In/Out averaged as minutes-since-midnight and shown as 12-hour AM/PM. Rows with a missing In or Out are skipped. Night rows (`r[10]` flag or shift code DN/NIGHT) are averaged **separately** with a circular mean, so a 06:30 AM next-day Out never contaminates the day-shift Out. Day-shift rows with Out ≤ In are dropped. *Avg duty hours* = `r[4]+r[6]+r[8]` (OT excluded) over punch-complete days.

**Money:** never recomputed. Read directly from `totalEarned`, `otAmount`, `holidayAmount`, `nightAmount`.

**Issues (G):** read from the file arrays `requisitionProblems`, `nightSuspects`, `punchProblems` — grouped by month, newest first.

**Rank / section average (I-3 / I-4):** section = the data's `area` field. Rank = `1 + (number of people in the area with more OT hours)`. The average is anonymous and is hidden when the area has fewer than 5 people. No other person's name or ID is ever shown.

**Streak (I-1):** consecutive months, counted back from the latest, with present% = 100. Best month = highest present% (ties → newer month).

**`daily` row columns** (the original spec's `?` marks, now verified): `[0] date, [1] day, [2] in, [3] out, [4] regular duty, [5] OT extra, [6] day-off duty, [7] day-off extra, [8] holiday duty, [9] holiday extra, [10] night flag, [11] shift code`.

---

## 3. Data-size impact

| | Before (naive: all months) | After (Option A) |
|---|---|---|
| Files fetched for a full-year profile | 12 month files | **1** (`data/emp/<DEPT>/<ID>.json`) |
| Raw size | 31.8 MB (12 PR month files; Oct alone 6.4 MB) | avg **20.8 KB**, max 34.5 KB |
| Over the wire with gzip (GitHub Pages) | ≈ 3.0 MB (2026 only: ≈ 2.7 MB) | avg **3.8 KB**, max 5.8 KB |

* The task brief's "≈ 40 MB" is the **uncompressed** figure; real mobile transfer for Option B is ≈ 2.7 MB. Option A is still ~700× smaller.
* **Repo cost:** `data/emp/` = 1,285 files (1,213 PR + 72 QA), 27.4 MB on disk. This is the price of the fast path and is regenerated automatically by the workflows.
* **Option B** (automatic if a per-employee file 404s): month files newest-first with a "Loading n/11 months…" bar; only a compact extract (≈ 8 KB) is stored in `localStorage` under the app's namespaced key; closed months are never refetched.
* Offline: the service worker's runtime cache serves a previously opened `data/emp` file, so the **year scope works offline** (verified: CF2170 shows the same 577 h / ৳ 51,542 online and offline).

---

## 4. Verification evidence (all run in this repo, Playwright Chromium 390×844 @2x)

| Check | Result |
|---|---|
| Report refactor regression (`tests/regress_report_rows.js`, original `report.js` vs shared function) | 1,918 employee-months, **0 diffs** |
| Per-employee file ≡ month-file results (`tests/emp_history_equiv.js`) | 135 employees / 1,376 employee-months, **0 diffs** |
| Loader Option A/B (`tests/loader.test.js`, `smoke_loader.py`) | PASS; Option B 11 fetches first run, **0** on second run |
| Page ⇄ independent Python cross-check — year totals (`crosscheck_p4/p5/p6/p6b`, `crosscheck_profile`) | **ALL PASS** — 5 employees (4 PR + 1 QA): OT, earned, night, holiday, avg In/Out, issue counts, chip counts, rank, section average |
| Final sweep (`tests/verify_p7.py`) | **ALL PASS** — see below |

`verify_p7.py` covers: no saved ID (empty state, light+dark); unknown ID (message, not blank); all 5 bottom-nav tabs with `.active` + `aria-current` (light+dark); 4 employees × 11 sections × light+dark screenshots; no horizontal overflow; tap targets ≥ 44 px; hide-amounts blur + persistence; Me → Report → Back → Me; cold `#/profile` deep link; VS from More (+ More highlighted); offline with the service worker; console free of errors.

Test employees: `556490` (Siratun Nabi — Nov: 5 requisition + 2 punch problems, 10 night duties), `CF2170` (44 night, 54 holiday, 11 months), `CF2195` (zero issues → "All clear ✅"), `CF1181` (holidays, no nights), `CF2990` (1 month only), `556515` (QA).

Screenshots: `docs/screens/p1_* … p7_*`.

---

## 5. Decisions worth knowing (full log: `00_READ_ME_FIRST_HANDOFF.md`)

* **D-O3** No casual/sick leave concept; only `longTermLeaves` appears, as "Approved long leave", and only when non-zero.
* **D-3 / D-20** `getMonthDatasetMeta` (max active day, consensus holidays) and `prevNight` need the whole month, so they are pre-computed into each per-employee file under `meta[ym]` / `prevNight`. The logic exists in **three copies** (`app-main.js`, `build_emp_history.py`, `profile-data.js`); `emp_history_equiv.js` guards them. If the logic in `app-main.js` changes, change all three.
* **D-19** The current month is always read fresh from the month file; the per-employee file only corrects `prevNight`.
* **D-23** Scope chips wrap instead of scrolling (the 4th chip was being clipped).
* **D-24** App month cache is not department-aware: if the primary month returns `null` for the user, the per-employee file (whose path contains the dept) is used.
* **D-25** If the employee has no record in the current month, "This month" shows "No record"; scope is not switched automatically.
* **D-9** Desktop keeps the VS button in the top nav (More is hidden on desktop); "move VS to More" applies to the mobile bottom nav.
* **A4** An employee who joins/leaves mid-month has earlier/later days counted Absent — this is existing Report behaviour and was deliberately not changed.
* **Part 7:** `sw.js` `CACHE_NAME` kept at `checkot-pwa-v20261114-profile-p6b` (no app asset changed in Part 7, so no needless cache invalidation).

---

## 6. Skipped / limitations (and why)

1. **"View another employee" (spec §2, optional "only if cheap")** — skipped. It conflicts with the §5 privacy rule that the page shows only the saved ID's own data, and in-charges already have `viewEmployeeFromLeaderboard`.
2. **I-3 three-month rank trend** — skipped; it needs three large month files for one small number.
3. **I-6 Payslip shortcut** — skipped (D-33): `#payslipCard` is never made visible in the live code (only a stale copy in `admin-core.js` does), so a shortcut would be a dead button. Enable the card first, then add the shortcut.
4. **Share-as-image (I-5)** — implemented with the same lazy-loaded html2canvas that Report uses (no new CDN), but the sandbox has no network, so a **real PNG was never generated here**; only the card HTML and the failure path were verified. **Please try it once on a real phone.**
5. **QA history** — only 2026-11 exists for QA, so QA profiles show one month (handled as an edge case).
6. **Tap targets** — every control added by this feature is ≥ 44 px. The app-wide theme pill in the page header (48×26) already existed on every page and was left alone.
7. **Console** — in the sandbox the only noise is blocked external hosts (CDN/fonts/Firebase) and, for an unknown ID, the expected `data/emp/...` 404 that triggers the Option B fallback.
8. The repo is not a git checkout in this environment, so no commits were made; each Part was delivered as a package instead.

---

## 7. How to rebuild / re-test

```bash
python3 scripts/build_emp_history.py            # regenerate all data/emp files
python3 -m http.server 8765                     # serve the repo (tests expect :8765)
node tests/regress_report_rows.js <original-report.js>   # needs the pre-refactor report.js
node tests/emp_history_equiv.js && node tests/loader.test.js
python3 tests/crosscheck_profile.py             # + crosscheck_p4/p5/p6/p6b_page.py
python3 tests/verify_p7.py                      # final end-to-end sweep (writes docs/screens/p7_*)
```
