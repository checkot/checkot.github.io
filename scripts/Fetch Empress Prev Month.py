#!/usr/bin/env python3
"""
Empress Previous-Month Work Log Auto-Fetcher
============================================
- Runs during the first N days of each month (default: days 1..10, Bangladesh time UTC+6).
  Set FORCE_RUN=1 (or pass --force) to run on any day for manual testing.
- Logs into Empress, opens MonthlyWorkLogReport, clicks the "Last month" preset button,
  verifies the Period date switched to the previous month, applies the Facility filter,
  exports Excel, and converts it via scripts/to_json.py with update_latest=False so
  data/latest.json (current month) is NEVER overwritten!
"""

import datetime
import json
import os
import pathlib
import re
import sys
import time
import traceback

import openpyxl
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# Ensure sibling modules (to_json, build_emp_history) are importable
SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

BASE = "https://empress.renata-ltd.com/"
REPORT = BASE + "Extension/MonthlyWorkLogReport"
OUT = pathlib.Path("raw_prev")
OUT.mkdir(exist_ok=True)

DEFAULT_FACILITY = "Rajendrapur Potent Product Facility"
MAX_ATTEMPTS = 3
DOWNLOAD_TIMEOUT = 300_000
STEP_TIMEOUT = 45_000
DEFAULT_MAX_DAY = 10  # প্রত্যেক মাসের ১ থেকে ১০ তারিখ পর্যন্ত চলবে

EN_MONTHS_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


class LoginError(Exception):
    """পাসওয়ার্ড ভুল হলে এই এরর। এতে আর রিট্রাই করা হবে না (অ্যাকাউন্ট লক এড়াতে)।"""


def get_bd_now():
    bd_tz = datetime.timezone(datetime.timedelta(hours=6))
    return datetime.datetime.now(bd_tz)


def get_previous_month_info(now_bd=None):
    """Return (year, month, 'YYYY-MM', 'Mon YYYY') for the calendar month before now_bd."""
    now = now_bd or get_bd_now()
    y, m = now.year, now.month - 1
    if m < 1:
        m = 12
        y -= 1
    ym = f"{y}-{m:02d}"
    mon_yr = f"{EN_MONTHS_SHORT[m - 1]} {y}"
    return y, m, ym, mon_yr


def shot(page, name):
    try:
        page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    except Exception as e:
        print("screenshot failed:", e)


def login(page, acc):
    page.goto(BASE, wait_until="domcontentloaded")
    pass_input = page.locator('input[type="password"]').first
    pass_input.wait_for(state="visible", timeout=STEP_TIMEOUT)
    page.locator('input[type="text"]').first.fill(acc["user"])
    pass_input.fill(acc["pass"])
    pass_input.press("Enter")
    try:
        pass_input.wait_for(state="hidden", timeout=STEP_TIMEOUT)
    except PWTimeout:
        raise LoginError("লগইন হয়নি। ইউজার/পাসওয়ার্ড চেক করুন।")


def select_last_month(page, expected_mon_yr):
    """Click the 'Last month' Period preset pill and verify the date inputs updated."""
    btn = page.get_by_role("button", name=re.compile(r"^\s*Last month\s*$", re.I)).first
    try:
        btn.wait_for(state="visible", timeout=10_000)
        btn.click()
    except Exception:
        fallback = page.get_by_text(re.compile(r"^\s*Last month\s*$", re.I)).first
        fallback.wait_for(state="visible", timeout=STEP_TIMEOUT)
        fallback.click()

    # Wait briefly and verify that at least one Period date input now shows previous month (e.g., "Oct 2026")
    deadline = time.time() + 10.0
    matched_val = None
    while time.time() < deadline:
        try:
            vals = page.eval_on_selector_all(
                "input",
                "els => els.map(e => (e.value || '').trim()).filter(Boolean)",
            )
            for v in vals:
                if expected_mon_yr.lower() in v.lower():
                    matched_val = v
                    break
            if matched_val:
                break
        except Exception:
            pass
        time.sleep(0.4)

    if not matched_val:
        raise RuntimeError(
            f"'Last month' ক্লিকের পর Period-এ '{expected_mon_yr}' দেখা যায়নি।"
        )
    print(f"   Last month confirmed (date input: {matched_val})")


def select_only_facility(page, facility):
    facility_header = page.get_by_text("Facility", exact=True).first
    if not facility_header.is_visible():
        page.get_by_text("Filters", exact=True).first.click()
        facility_header.wait_for(state="visible", timeout=STEP_TIMEOUT)

    facility_header.click()
    item = page.get_by_text(facility, exact=True).first
    item.wait_for(state="visible", timeout=STEP_TIMEOUT)
    item.scroll_into_view_if_needed()
    item.click()

    ticked = page.get_by_text(re.compile(r"^\s*1 of \d+ ticked")).first
    try:
        ticked.wait_for(state="visible", timeout=10_000)
    except PWTimeout:
        item.locator("xpath=ancestor::tr[1]//input[@type='checkbox']").first.click()
        ticked.wait_for(state="visible", timeout=10_000)

    page.get_by_text("Narrowed by Facility").first.wait_for(state="visible", timeout=10_000)

    try:
        facility_header.click()
    except Exception:
        pass


def export_excel(page):
    with page.expect_download(timeout=DOWNLOAD_TIMEOUT) as dl:
        try:
            page.get_by_role("button", name=re.compile(r"Export Excel", re.I)).first.click(timeout=10_000)
        except Exception:
            page.get_by_text("Export Excel").first.click(timeout=10_000)
    return dl.value


def validate_xlsx(path):
    if path.suffix.lower() not in (".xlsx", ".xlsm"):
        size = path.stat().st_size
        if size < 1024:
            raise RuntimeError(f"ফাইল খুব ছোট ({size} bytes)")
        return -1
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.worksheets[0]
    rows = sum(1 for _ in ws.iter_rows(values_only=True))
    wb.close()
    if rows < 2:
        raise RuntimeError(f"ফাইলে ডাটা নেই (rows={rows})")
    return rows


def fetch_account_prev_month(browser, acc, expected_ym, expected_mon_yr):
    name = acc["name"]
    facility = acc.get("facility", DEFAULT_FACILITY)
    ctx = browser.new_context(accept_downloads=True, viewport={"width": 1366, "height": 900})
    page = ctx.new_page()
    page.set_default_timeout(STEP_TIMEOUT)
    page.route(
        "**/*",
        lambda r: r.abort() if r.request.resource_type in ("image", "font", "media") else r.continue_(),
    )
    try:
        print("-> Login...")
        login(page, acc)

        print("-> Report page...")
        page.goto(REPORT, wait_until="domcontentloaded")
        page.get_by_role("button", name=re.compile(r"Export Excel", re.I)).first.wait_for(
            state="visible", timeout=STEP_TIMEOUT
        )

        print(f"-> Selecting 'Last month' ({expected_mon_yr})...")
        select_last_month(page, expected_mon_yr)

        print(f"-> Facility filter: {facility}")
        select_only_facility(page, facility)
        shot(page, f"{name}_prev_filter_ok")

        print("-> Export Excel (Last month)...")
        t0 = time.time()
        d = export_excel(page)
        suffix = pathlib.Path(d.suggested_filename).suffix or ".xlsx"
        tmp = OUT / f"{name}_prev.tmp{suffix}"
        d.save_as(tmp)
        rows = validate_xlsx(tmp)
        final = OUT / f"{name}_{expected_ym}{suffix}"
        tmp.replace(final)
        print(f"   downloaded in {time.time() - t0:.0f}s, rows={rows}, file={final.name}")
        return final
    except Exception:
        shot(page, f"{name}_prev_99_error")
        try:
            (OUT / f"{name}_prev_99_error.html").write_text(page.content(), encoding="utf-8")
        except Exception:
            pass
        raise
    finally:
        ctx.close()


def convert_prev_month_excels(downloaded_files, expected_ym):
    """Convert downloaded previous-month Excel files WITHOUT touching data/latest.json."""
    import to_json

    named_pr = []
    named_qa = []
    for dept, fpath in downloaded_files:
        wb = openpyxl.load_workbook(fpath, data_only=True)
        if str(dept).upper() == "QA":
            named_qa.append((fpath.name, wb))
        else:
            named_pr.append((fpath.name, wb))

    if named_pr:
        to_json.build_month(
            named_pr,
            archive=True,
            update_latest=False,  # data/latest.json (current month) অক্ষুণ্ণ থাকবে
            force_month=expected_ym,
            dept="PR",
            out_dir=to_json.DATA_DIR,
        )
    if named_qa:
        to_json.build_month(
            named_qa,
            archive=True,
            update_latest=False,
            force_month=expected_ym,
            dept="QA",
            out_dir=to_json.DATA_DIR / "qa",
        )

    try:
        import build_emp_history
        build_emp_history.build_all_emp_histories()
    except Exception as emp_err:
        print(f"[WARN] Could not rebuild per-employee history files: {emp_err}")


def main():
    force = "--force" in sys.argv or os.environ.get("FORCE_RUN", "").strip().lower() in ("1", "true", "yes")
    max_day = int(os.environ.get("PREV_MONTH_MAX_DAY", str(DEFAULT_MAX_DAY)))
    now_bd = get_bd_now()

    print(f"=== Empress Previous-Month Fetch ===")
    print(f"Current BD Time: {now_bd.strftime('%Y-%m-%d %I:%M %p')} (Day {now_bd.day})")

    if not force and now_bd.day > max_day:
        print(f"Skipping: today is day {now_bd.day} (runs only on days 1–{max_day}; pass --force or FORCE_RUN=1 to override).")
        return

    _, _, expected_ym, expected_mon_yr = get_previous_month_info(now_bd)
    print(f"Target Previous Month: {expected_ym} ({expected_mon_yr})")

    accounts = json.loads(os.environ["EMPRESS_ACCOUNTS"])
    all_ok = True
    downloaded = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for acc in accounts:
            name = acc["name"]
            dept = acc.get("dept", "PR")
            print(f"\n=== Account: {name} (dept={dept}) ===")
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    fpath = fetch_account_prev_month(browser, acc, expected_ym, expected_mon_yr)
                    downloaded.append((dept, fpath))
                    print("STATUS: OK", name)
                    break
                except LoginError as e:
                    print("STATUS: FAIL (login, no retry)", name, e)
                    all_ok = False
                    break
                except Exception as e:
                    print(f"attempt {attempt}/{MAX_ATTEMPTS} failed:", repr(e))
                    traceback.print_exc()
                    if attempt == MAX_ATTEMPTS:
                        print("STATUS: FAIL", name)
                        all_ok = False
                    else:
                        time.sleep(10 * attempt)
        browser.close()

    if not all_ok or not downloaded:
        sys.exit(1)

    convert_prev_month_excels(downloaded, expected_ym)

    # Clean up downloaded Excel files after successful conversion
    for _, fpath in downloaded:
        try:
            fpath.unlink()
        except Exception:
            pass
    print(f"[SUCCESS] Previous month ({expected_ym}) updated without modifying data/latest.json.")


if __name__ == "__main__":
    main()