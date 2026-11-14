"""Page-vs-Python check for sections D/E/F/H (year scope) + screenshots. usage: python3 tests/crosscheck_p5_page.py [ID ...]"""
import json, glob, re, os, sys, math
from playwright.sync_api import sync_playwright
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
IDS = sys.argv[1:] or ['556490', 'CF2170', 'CF1181', 'CF2195', '556515']
def load(d):
    o = {}
    for m in sorted(glob.glob(d + '/20*.json')):
        if re.search(r'\d{4}-\d{2}\.json$', m): o[m[-12:-5]] = json.load(open(m))['employees']
    return o
DATA = [load('data'), load('data/qa')]
mins = lambda t: (lambda q: int(q[1]) * 60 + int(q[2]) if q else None)(re.match(r'^(\d{1,2}):(\d{2})', str(t or '')))
def f12(m):
    m = int(math.floor(m + 0.5)) % 1440; h = m // 60; return '%02d:%02d %s' % ((h % 12) or 12, m % 60, 'PM' if h >= 12 else 'AM')
def expected(pid):
    for data in DATA:
        have = {ym: e for ym, es in data.items() if ym.startswith('2026') for e in es if str(e['id']).upper() == pid}
        if have: break
    else: return None
    di, do = [], []
    for e in have.values():
        for r in e['daily']:
            r = list(r) + [0] * (12 - len(r)); a, b = mins(r[2]), mins(r[3])
            if not a or not b: continue
            if r[10] or str(r[11]).upper() == 'DN' or 'NIGHT' in str(r[11]).upper(): continue
            if b <= a: continue
            di.append(a); do.append(b)
    return dict(ot=round(sum(e['otHours'] for e in have.values()), 2), night=int(sum(e['nightCount'] for e in have.values())),
                hol=int(sum(e['holidayCount'] for e in have.values())), nd=sum(len(e.get('nightDays') or []) for e in have.values()),
                hd=sum(len(e.get('holidayDays') or []) for e in have.values()),
                avgIn=f12(sum(di) / len(di)) if di else '—', avgOut=f12(sum(do) / len(do)) if do else '—')
fails = 0
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for pid in IDS:
        exp = expected(pid)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block'); pg = ctx.new_page()
        pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(1800)
        if pg.evaluate('document.getElementById("modeSetupModal").classList.contains("open")'): pg.click('#modeModalCloseBtn')
        pg.click('.bottom-nav [data-nav=profile]'); pg.fill('#profIdInput', pid); pg.click('#profSaveIdBtn')
        pg.wait_for_selector('#profBody .prof-card:not(.prof-skel-card)', timeout=20000)
        pg.click('[data-act=scope][data-val=year]'); pg.wait_for_selector('#profH', timeout=20000); pg.wait_for_timeout(900)
        kv = lambda sid: pg.eval_on_selector_all(f'#{sid} .prof-kv3 b', 'e=>e.map(x=>x.innerText.trim())')
        D, E, F, H = kv('profD'), kv('profE'), kv('profF'), kv('profH')
        chipsE = pg.locator('#profE .prof-dchip').count(); chipsF = pg.locator('#profF .prof-dchip').count()
        ok = (float(D[0].replace('h', '')) == exp['ot'] and int(E[0]) == exp['night'] and int(F[0]) == exp['hol']
              and H[0] == exp['avgIn'] and H[1] == exp['avgOut'] and chipsE == exp['nd'] and chipsF == exp['hd'])
        print('PASS' if ok else 'FAIL', pid, '| D', D, '| E', E[0], 'chips', chipsE, '| F', F[0], 'chips', chipsF, '| H', H, '| exp', exp)
        fails += 0 if ok else 1
        if pid in ('CF2170', '556490'):
            for sid in 'DEFH':
                pg.evaluate(f'document.getElementById("prof{sid}").scrollIntoView()'); pg.wait_for_timeout(150)
                pg.screenshot(path=f'docs/screens/p5_{pid}_{sid}_light.png')
            pg.evaluate('document.documentElement.setAttribute("data-theme","dark")'); pg.wait_for_timeout(200)
            for sid in 'EH':
                pg.evaluate(f'document.getElementById("prof{sid}").scrollIntoView()'); pg.wait_for_timeout(150)
                pg.screenshot(path=f'docs/screens/p5_{pid}_{sid}_dark.png')
            print('  overflow-x:', pg.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'))
        ctx.close()
    b.close()
print('ALL PASS' if not fails else f'{fails} FAILED'); sys.exit(1 if fails else 0)
