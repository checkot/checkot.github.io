import os, json, pathlib, traceback
from playwright.sync_api import sync_playwright

ACCOUNTS = json.loads(os.environ["EMPRESS_ACCOUNTS"])
BASE = "https://empress.renata-ltd.com/"
REPORT = BASE + "Extension/MonthlyWorkLogReport"
OUT = pathlib.Path("raw"); OUT.mkdir(exist_ok=True)

def shot(page, name):
    try:
        page.screenshot(path=f"raw/{name}.png", full_page=True)
    except Exception as e:
        print("screenshot failed:", e)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for acc in ACCOUNTS:
        print(f"=== {acc['name']} ===")
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        page.set_default_timeout(60_000)
        try:
            # 1) Login
            page.goto(BASE, wait_until="domcontentloaded")
            shot(page, f"{acc['name']}_01_login_page")

            page.get_by_placeholder("Enter your login ID").fill(acc["user"])
            page.get_by_placeholder("Enter your password").fill(acc["pass"])
            page.get_by_role("button", name="Login").click()

            page.wait_for_load_state("networkidle", timeout=60_000)
            shot(page, f"{acc['name']}_02_after_login")
            print("URL after login:", page.url)

            # 2) Report page
            page.goto(REPORT, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=60_000)
            shot(page, f"{acc['name']}_03_report_page")

            # 3) Export — no "This month" click first, keep it simple
            with page.expect_download(timeout=300_000) as dl:
                page.get_by_role("button", name="Export Excel").click()
            d = dl.value
            print("Suggested filename:", d.suggested_filename)
            save = OUT / f"{acc['name']}{pathlib.Path(d.suggested_filename).suffix or '.xlsx'}"
            d.save_as(save)
            print("SAVED:", save, save.stat().st_size, "bytes")
            print("STATUS: OK", acc["name"])

        except Exception as e:
            print("STATUS: FAIL", acc["name"], repr(e))
            traceback.print_exc()
            shot(page, f"{acc['name']}_99_error")
        finally:
            ctx.close()
    browser.close()
