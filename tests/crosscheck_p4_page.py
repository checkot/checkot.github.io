"""Page-vs-Python cross-check: year hero tiles shown on the Me page == independent sums from data/*.json.
usage: python3 tests/crosscheck_p4_page.py [ID ...]   (static server on :8765; QA ids use data/qa)"""
import json, glob, re, os, sys, math
from playwright.sync_api import sync_playwright
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
IDS = sys.argv[1:] or ['556490', 'CF2170', 'CF1181', 'CF2195', 'CF2990', '556515']
def load(d):
    out = {}
    for m in sorted(glob.glob(d + '/20*.json')):
        if re.search(r'\d{4}-\d{2}\.json$', m): out[m[-12:-5]] = json.load(open(m))['employees']
    return out
PR, QA = load('data'), load('data/qa')
def expected(pid):
    for dept, data in (('PR', PR), ('QA', QA)):
        have = {}
        for ym, es in data.items():
            if not ym.startswith('2026'): continue
            e = next((x for x in es if str(x['id']).upper() == pid), None)
            if e: have[ym] = e
        if have: break
    else: return None
    S = lambda k: sum(e.get(k) or 0 for e in have.values())
    return dict(dept=dept, months=len(have), ot=round(S('otHours'), 2), earned=math.floor(S('totalEarned') + 0.5),
                night=int(S('nightCount')), hol=int(S('holidayCount')),
                best=max(have.items(), key=lambda kv: kv[1]['totalEarned'])[0],
                ot_amt=S('otAmount'), hol_amt=S('holidayAmount'), nt_amt=S('nightAmount'))
fails = 0
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for pid in IDS:
        exp = expected(pid)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); pg = ctx.new_page()
        pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(1800)
        if pg.evaluate('document.getElementById("modeSetupModal").classList.contains("open")'): pg.click('#modeModalCloseBtn')
        pg.click('.bottom-nav [data-nav=profile]'); pg.fill('#profIdInput', pid); pg.click('#profSaveIdBtn')
        pg.wait_for_selector('#profBody .prof-card:not(.prof-skel-card)', timeout=20000); pg.wait_for_timeout(800)
        if exp is None:
            print(pid, 'no data in files; page says:', pg.inner_text('#profBody')[:60].replace('\n', ' ')); ctx.close(); continue
        pg.click('[data-act=scope][data-val=year]'); pg.wait_for_selector('#profA', timeout=20000); pg.wait_for_timeout(900)
        t = dict(pg.eval_on_selector_all('#profA .prof-tile', 'els=>els.map(e=>[e.querySelector(".prof-tile-k").childNodes[0].textContent.trim(),e.querySelector(".prof-tile-v").innerText.trim()])'))
        num = lambda s: float(re.sub(r'[^0-9.\-]', '', s.replace('h', '')) or 0)
        got = dict(ot=num(t['Total OT']), earned=int(num(t['OT income'])), night=int(num(t['Night duties'])), hol=int(num(t['Holiday duties'])))
        # chart table: per-month components must sum to the hero
        rows = pg.evaluate('''()=>{pg=document.querySelectorAll("#profC .prof-table tbody tr");return [...pg].map(r=>[...r.children].map(c=>c.textContent.trim()))}''')
        n = lambda s: int(re.sub(r'[^0-9]', '', s) or 0)
        tot = sum(n(r[4]) for r in rows if len(r) == 5)
        ok = all(abs(got[k] - exp[k]) < 0.011 for k in ('ot', 'earned', 'night', 'hol'))
        ok_tbl = abs(tot - exp['earned']) <= len([r for r in rows if len(r) == 5])  # rounding of each month
        best = pg.inner_text('#profC .prof-kv').split('\n')
        ok_best = _ = any(exp['best'] and ['January','February','March','April','May','June','July','August','September','October','November','December'][int(exp['best'][5:]) - 1] in x for x in best)
        print(('PASS' if ok and ok_tbl and ok_best else 'FAIL'), pid, exp['dept'], 'months', exp['months'], '| page', got, '| expected', {k: exp[k] for k in ('ot', 'earned', 'night', 'hol')}, '| table-sum', tot, '| best', exp['best'], ok_best)
        if not (ok and ok_tbl and ok_best): fails += 1
        ctx.close()
    b.close()
print('ALL PASS' if not fails else f'{fails} FAILED'); sys.exit(1 if fails else 0)
