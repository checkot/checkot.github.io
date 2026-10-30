import os, json, pathlib, traceback, sys
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

all_ok = True

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for acc in ACCOUNTS:
        print(f"\n=== Testing Account: {acc['name']} ===")
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        page.set_default_timeout(60_000)
        
        try:
            print("-> Opening login page...")
            page.goto(BASE, wait_until="networkidle") # পুরো পেজ লোড হওয়া পর্যন্ত অপেক্ষা করবে
            page.wait_for_timeout(3000)
            shot(page, f"{acc['name']}_01_login_page")

            print("-> Filling credentials...")
            # সরাসরি ইনপুট বক্সের ধরন (type) দিয়ে খুঁজে বের করবে
            text_input = page.locator('input[type="text"]').first
            pass_input = page.locator('input[type="password"]').first
            
            text_input.fill(acc["user"])
            pass_input.fill(acc["pass"])

            print("-> Logging in...")
            # বাটন খোঁজার ঝামেলা এড়াতে পাসওয়ার্ড বক্সে Enter চাপবে
            pass_input.press("Enter")
            
            print("-> Waiting for dashboard...")
            page.wait_for_load_state("networkidle", timeout=30000)
            page.wait_for_timeout(4000)
            shot(page, f"{acc['name']}_02_after_login")

            if "login" in page.url.lower():
                raise Exception("লগইন ব্যর্থ! পাসওয়ার্ড চেক করুন।")

            print("-> Opening Report page...")
            page.goto(REPORT, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(4000)
            shot(page, f"{acc['name']}_03_report_page")

            print("-> Clicking Export Excel...")
            with page.expect_download(timeout=300_000) as dl:
                # বাটন বা টেক্সট যা-ই হোক, খুঁজে বের করবে
                page.locator('button:has-text("Export Excel"), a:has-text("Export Excel"), text="Export Excel"').first.click()
            
            d = dl.value
            print("-> File downloaded:", d.suggested_filename)
            save = OUT / f"{acc['name']}{pathlib.Path(d.suggested_filename).suffix or '.xlsx'}"
            d.save_as(save)
            print("STATUS: OK", acc["name"])

        except Exception as e:
            all_ok = False
            print("\n❌ STATUS: FAIL", acc["name"])
            print("Error Details:", repr(e))
            traceback.print_exc()
            shot(page, f"{acc['name']}_99_error")
        finally:
            ctx.close()
    browser.close()

if not all_ok:
    sys.exit(1)
