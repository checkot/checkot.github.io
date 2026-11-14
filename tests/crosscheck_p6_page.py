"""Section G check: page issue counts/items vs Python, ERP message + modal, screenshots. usage: python3 tests/crosscheck_p6_page.py [ID ...]"""
import json, glob, re, os, sys
from playwright.sync_api import sync_playwright
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
IDS = sys.argv[1:] or ['556490', 'CF4275', 'CF2170', 'CF2195', '556515']
def load(d):
    o = {}
    for m in sorted(glob.glob(d + '/20*.json')):
        if re.search(r'\d{4}-\d{2}\.json$', m): o[m[-12:-5]] = json.load(open(m))['employees']
    return o
DATA = [load('data'), load('data/qa')]
def expected(pid):
    for data in DATA:
        have = {ym: e for ym, es in data.items() if ym.startswith('2026') for e in es if str(e['id']).upper() == pid}
        if have: break
    else: return None
    s = lambda k: sum(len(e.get(k) or []) for e in have.values())
    return dict(r=s('requisitionProblems'), n=s('nightSuspects'), p=s('punchProblems'))
fails = 0
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for pid in IDS:
        exp = expected(pid)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block'); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(1800)
        if pg.evaluate('document.getElementById("modeSetupModal").classList.contains("open")'): pg.click('#modeModalCloseBtn')
        pg.click('.bottom-nav [data-nav=profile]'); pg.fill('#profIdInput', pid); pg.click('#profSaveIdBtn')
        pg.wait_for_selector('#profBody .prof-card:not(.prof-skel-card)', timeout=20000)
        pg.click('[data-act=scope][data-val=year]'); pg.wait_for_selector('#profG', timeout=20000); pg.wait_for_timeout(900)
        pg.wait_for_function('!document.querySelector("#profG.prof-skel-card")')
        clear = pg.locator('#profG .prof-allclear').count() == 1
        chips = pg.eval_on_selector_all('#profG .prof-iss-chip b', 'e=>e.map(x=>parseInt(x.innerText.replace(/,/g,"")))') if not clear else [0, 0, 0]
        items = pg.locator('#profG .prof-iss').count()
        total = exp['r'] + exp['n'] + exp['p']
        ok = chips == [exp['r'], exp['n'], exp['p']] and items == total and clear == (total == 0) and not errs
        msg = ''
        if items:
            pg.evaluate('document.querySelectorAll("#profG details").forEach(d=>d.open=true)')
            pg.locator('#profG [data-act=erp][data-t]:not([data-t=all])').first.click(); pg.wait_for_timeout(400)
            opened = pg.evaluate('document.getElementById("erpSupportModal").classList.contains("open")')
            msg = pg.evaluate('pendingErpMessage')
            ok = ok and opened and pid in msg and 'Dear ERP Team' in msg
            if pid in ('556490', 'CF4275'):
                pg.screenshot(path=f'docs/screens/p6_{pid}_G_modal.png')
            pg.evaluate('closeErpSupportModal()')
            pg.locator('#profG [data-act=erp][data-t=all]').first.click(); pg.wait_for_timeout(300)
            allmsg = pg.evaluate('pendingErpMessage'); ok = ok and allmsg.count('•') >= 1
            pg.evaluate('closeErpSupportModal()')
        print('PASS' if ok else 'FAIL', pid, '| page', chips, 'items', items, '| exp', exp, '| allclear', clear, '| errs', errs[:1])
        if msg and pid == '556490': print('  sample msg:', msg.replace('\n', ' / ')[:230])
        fails += 0 if ok else 1
        if pid in ('556490', 'CF4275', 'CF2195'):
            pg.evaluate('document.getElementById("profG").scrollIntoView()'); pg.wait_for_timeout(200)
            pg.screenshot(path=f'docs/screens/p6_{pid}_G_light.png')
            pg.evaluate('document.documentElement.setAttribute("data-theme","dark")'); pg.wait_for_timeout(200)
            pg.screenshot(path=f'docs/screens/p6_{pid}_G_dark.png')
            print('  overflow-x:', pg.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'))
        ctx.close()
    b.close()
print('ALL PASS' if not fails else f'{fails} FAIL')
