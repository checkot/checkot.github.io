"""I-3/I-4 (rank + section avg) vs Python, I-5 share card html. usage: python3 tests/crosscheck_p6b_page.py [ID ...]"""
import json, os, sys
from playwright.sync_api import sync_playwright
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
IDS = sys.argv[1:] or ['556490', 'CF2170', 'CF1181', 'CF2195']
YM = '2026-11'
def expected(pid, dept='PR'):
    f = 'data/%s%s.json' % ('qa/' if dept == 'QA' else '', YM)
    es = json.load(open(f))['employees']; me = [e for e in es if str(e['id']).upper() == pid][0]
    peers = [e for e in es if e['area'] == me['area']]
    mine = me['otHours']; rank = 1 + sum(1 for e in peers if e['otHours'] > mine)
    avg = round(sum(e['otHours'] for e in peers) / len(peers), 2) if len(peers) >= 5 else None
    return dict(rank=rank, n=len(peers), mine=mine, avg=avg)
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
        pg.wait_for_selector('#profI3', timeout=20000); pg.wait_for_timeout(800)
        if pg.locator('#profI3 [data-act=cmpload]').count(): pg.click('#profI3 [data-act=cmpload]')
        pg.wait_for_function('document.querySelector("#profI3 .prof-kv3")', timeout=30000)
        v = pg.eval_on_selector_all('#profI3 .prof-kv3 b', 'e=>e.map(x=>x.innerText.replace(/\\s/g,""))')
        rank = int(v[0].split('/')[0].lstrip('#')); n = int(v[0].split('/')[1].replace(',', ''))
        mine = float(v[1].replace('h', '')); avg = None if v[2] == '—' else float(v[2].replace('h', ''))
        ok = rank == exp['rank'] and n == exp['n'] and abs(mine - exp['mine']) < 0.01 and ((avg is None and exp['avg'] is None) or (avg is not None and exp['avg'] is not None and abs(avg - exp['avg']) < 0.01))
        html = pg.evaluate('_pfShareHtml()'); ok = ok and pid in html and 'Total OT' in html
        txt = pg.inner_text('#profI3'); ok = ok and ('OTHER' not in txt)
        print('PASS' if ok else 'FAIL', pid, '| page', v, '| exp', exp, '| errs', errs[:1]); fails += 0 if ok else 1
        if pid == '556490':
            pg.evaluate('document.getElementById("profI3").scrollIntoView()'); pg.wait_for_timeout(200); pg.screenshot(path='docs/screens/p6_556490_I3_light.png')
            pg.evaluate('document.documentElement.setAttribute("data-theme","dark")'); pg.wait_for_timeout(200); pg.screenshot(path='docs/screens/p6_556490_I3_dark.png')
            pg.evaluate('document.documentElement.setAttribute("data-theme","light")')
            pg.evaluate('window.html2canvas = undefined'); pg.click('#profBody [data-act=share]'); pg.wait_for_timeout(2500)
            print('  share failure path ok, no page error:', not errs, '| temp box removed:', pg.evaluate("Array.from(document.body.children).every(c=>!(c.style&&c.style.left==='-10000px'))"))
        ctx.close()
    b.close()
print('ALL PASS' if not fails else f'{fails} FAIL')
