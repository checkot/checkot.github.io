import os, json, pathlib, re, sys, time, traceback
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ACCOUNTS = json.loads(os.environ["EMPRESS_ACCOUNTS"])
BASE = "https://empress.renata-ltd.com/"
REPORT = BASE + "Extension/MonthlyWorkLogReport"
OUT = pathlib.Path("raw"); OUT.mkdir(exist_ok=True)

# অ্যাকাউন্টের JSON-এ "facility" না থাকলে এটাই ব্যবহার হবে
DEFAULT_FACILITY = "Rajendrapur Potent Product Facility"
MAX_ATTEMPTS = 3            # নেটওয়ার্ক/টাইমআউট সমস্যায় সর্বোচ্চ ৩ বার চেষ্টা
DOWNLOAD_TIMEOUT = 300_000  # ফিল্টারের পর ১-২ মিনিট লাগার কথা, ৫ মিনিটই যথেষ্ট
STEP_TIMEOUT = 45_000


class LoginError(Exception):
    """পাসওয়ার্ড ভুল হলে এই এরর। এতে আর রিট্রাই করা হবে না (অ্যাকাউন্ট লক এড়াতে)।"""


def shot(page, name):
    try:
        page.screenshot(path=f"raw/{name}.png", full_page=True)
    except Exception as e:
        print("screenshot failed:", e)


def login(page, acc):
    page.goto(BASE, wait_until="domcontentloaded")
    pass_input = page.locator('input[type="password"]').first
    pass_input.wait_for(state="visible", timeout=STEP_TIMEOUT)
    page.locator('input[type="text"]').first.fill(acc["user"])
    pass_input.fill(acc["pass"])
    pass_input.press("Enter")
    # লগইন সফল হলে পাসওয়ার্ড বক্সটা আর থাকে না
    try:
        pass_input.wait_for(state="hidden", timeout=STEP_TIMEOUT)
    except PWTimeout:
        raise LoginError("লগইন হয়নি। ইউজার/পাসওয়ার্ড চেক করুন।")


def select_only_facility(page, facility):
    # Filters প্যানেল বন্ধ থাকলে খুলুন
    facility_header = page.get_by_text("Facility", exact=True).first
    if not facility_header.is_visible():
        page.get_by_text("Filters", exact=True).first.click()
        facility_header.wait_for(state="visible", timeout=STEP_TIMEOUT)

    # Facility লিস্ট খুলুন
    facility_header.click()
    item = page.get_by_text(facility, exact=True).first  # exact: "Sterile" ভার্সনের সাথে গুলাবে না
    item.wait_for(state="visible", timeout=STEP_TIMEOUT)
    item.scroll_into_view_if_needed()
    item.click()

    # যাচাই: ঠিক ১টা ফ্যাসিলিটি টিক হয়েছে কি না
    ticked = page.get_by_text(re.compile(r"^\s*1 of \d+ ticked")).first
    try:
        ticked.wait_for(state="visible", timeout=10_000)
    except PWTimeout:
        # টেক্সটে ক্লিকে না হলে সরাসরি চেকবক্সে ক্লিক
        item.locator("xpath=ancestor::tr[1]//input[@type='checkbox']").first.click()
        ticked.wait_for(state="visible", timeout=10_000)

    # যাচাই: ফিল্টার সত্যিই "Facility" দিয়ে নেমেছে
    page.get_by_text("Narrowed by Facility").first.wait_for(state="visible", timeout=10_000)

    # লিস্ট বন্ধ করে দিন, যাতে বাটন ঢেকে না থাকে
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
    """ফাইল ফাঁকা বা নষ্ট কি না দেখে নেয়।"""
    if path.suffix.lower() not in (".xlsx", ".xlsm"):
        # .xls ইত্যাদি হলে openpyxl পারে না; অন্তত ফাইল ফাঁকা নয় সেটুকু দেখি
        size = path.stat().st_size
        if size < 1024:
            raise RuntimeError(f"ফাইল খুব ছোট ({size} bytes)")
        return -1
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True)
    ws = wb.worksheets[0]
    rows = sum(1 for _ in ws.iter_rows(values_only=True))
    wb.close()
    if rows < 2:
        raise RuntimeError(f"ফাইলে ডাটা নেই (rows={rows})")
    return rows


def fetch_account(browser, acc):
    name = acc["name"]
    facility = acc.get("facility", DEFAULT_FACILITY)
    ctx = browser.new_context(accept_downloads=True, viewport={"width": 1366, "height": 900})
    page = ctx.new_page()
    page.set_default_timeout(STEP_TIMEOUT)
    # ছবি/ফন্ট/মিডিয়া লোড বন্ধ: পেজ দ্রুত হয়, ডাটার কোনো ক্ষতি নেই
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

        print(f"-> Facility filter: {facility}")
        select_only_facility(page, facility)
        shot(page, f"{name}_filter_ok")

        print("-> Export Excel...")
        t0 = time.time()
        d = export_excel(page)
        suffix = pathlib.Path(d.suggested_filename).suffix or ".xlsx"
        tmp = OUT / f"{name}.tmp{suffix}"  # এক্সটেনশন আসল ফাইলেরই থাকবে, নইলে openpyxl খুলতে চায় না
        d.save_as(tmp)
        rows = validate_xlsx(tmp)
        final = OUT / f"{name}{suffix}"
        tmp.replace(final)  # যাচাই পাস করলেই আসল ফাইল বদলায়, নইলে আগেরটা অক্ষত
        print(f"   downloaded in {time.time() - t0:.0f}s, rows={rows}, file={final.name}")
    except Exception:
        shot(page, f"{name}_99_error")
        try:
            (OUT / f"{name}_99_error.html").write_text(page.content(), encoding="utf-8")
        except Exception:
            pass
        raise
    finally:
        ctx.close()


def main():
    all_ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for acc in ACCOUNTS:
            name = acc["name"]
            print(f"\n=== Account: {name} ===")
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    fetch_account(browser, acc)
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
    if not all_ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
