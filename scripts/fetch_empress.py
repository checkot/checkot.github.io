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
            page.goto(BASE, wait_until="domcontentloaded")
            
            # অপেক্ষা করবে যতক্ষণ না লগইন ইনপুট বক্সটা স্ক্রিনে আসে
            page.wait_for_selector('input[placeholder*="login ID"]', timeout=20000)
            page.wait_for_timeout(2000)
            shot(page, f"{acc['name']}_01_login_page")

            print("-> Filling credentials...")
            # সরাসরি input এর ভেতরের placeholder টেক্সট দিয়ে খোঁজা হচ্ছে
            page.locator('input[placeholder*="login ID"]').first.fill(acc["user"])
            page.locator('input[placeholder*="password"]').first.fill(acc["pass"])

            print("-> Clicking Login button...")
            # লগইন বাটন খোঁজার ৩টি আলাদা উপায় (একটা কাজ করবেই)
            try:
                page.locator('button:has-text("Login")').first.click(timeout=5000)
            except:
                try:
                    page.locator('div:has-text("Login")').last.click(timeout=5000)
                except:
                    # যদি বাটন না পায়, তবে পাসওয়ার্ড বক্সে Enter চাপবে
                    page.locator('input[placeholder*="password"]').first.press("Enter")

            print("-> Waiting for login to complete...")
            # অপেক্ষা করবে লগইন পেজ থেকে ড্যাশবোর্ডে চলে যাওয়া পর্যন্ত
            try:
                page.wait_for_url(lambda url: "login" not in url.lower(), timeout=30000)
            except:
                pass
            
            page.wait_for_load_state("networkidle", timeout=30000)
            shot(page, f"{acc['name']}_02_after_login")

            if "login" in page.url.lower() or page.locator('input[placeholder*="login ID"]').is_visible():
                raise Exception("লগইন ব্যর্থ! হয়তো পাসওয়ার্ড ভুল, অথবা ওয়েবসাইট সিকিউরিটি ব্লক করেছে।")

            print("-> Opening Report page...")
            page.goto(REPORT, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=60000)
            page.wait_for_timeout(5000)
            shot(page, f"{acc['name']}_03_report_page")

            print("-> Clicking Export Excel...")
            with page.expect_download(timeout=300_000) as dl:
                try:
                    page.locator('button:has-text("Export Excel")').first.click()
                except:
                    page.locator('text="Export Excel"').first.click()
            
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
    sys.exit(1) # ফেইল করলে লাল ক্রস দেখাবে
