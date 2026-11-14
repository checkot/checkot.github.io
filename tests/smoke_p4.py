# Part 4 smoke: header, chips, A/B/C on the real app. Usage: python3 tests/smoke_p4.py  (server on :8765)
import json, sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:8765/index.html'
OUT='/home/claude/repo/checkot.github.io-main/docs/screens/'
IDS=sys.argv[1:] or ['556490']
res={}; errs=[]
def tiles(pg):
    return pg.eval_on_selector_all('#profA .prof-tile','els=>els.map(e=>[e.querySelector(".prof-tile-k").childNodes[0].textContent.trim(),e.querySelector(".prof-tile-v").innerText.trim()])')
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for pid in IDS:
        ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,service_workers='block')
        pg=ctx.new_page()
        pg.on('console',lambda m: errs.append((pid,m.type,m.text[:160])) if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e: errs.append((pid,'pageerror',str(e)[:200])))
        pg.goto(BASE); pg.wait_for_timeout(2000)
        if pg.evaluate('document.getElementById("modeSetupModal").classList.contains("open")'): pg.click('#modeModalCloseBtn'); pg.wait_for_timeout(200)
        pg.click('.bottom-nav [data-nav=profile]'); pg.wait_for_timeout(400)
        pg.fill('#profIdInput',pid); pg.click('#profSaveIdBtn')
        pg.wait_for_selector('#profA, .prof-warn', timeout=20000); pg.wait_for_timeout(1200)
        r={}
        r['head']=pg.inner_text('#profHead .prof-head-main')
        r['chips']=pg.eval_on_selector_all('#profChips .prof-chip','e=>e.map(x=>[x.innerText.trim(),x.classList.contains("on")])')
        if pg.locator('#profA').count():
            r['month_tiles']=tiles(pg)
            r['month_B']=pg.eval_on_selector_all('#profB .prof-mrow','e=>e.map(x=>x.innerText.replace(/\\n/g," | "))')
            pg.screenshot(path=OUT+f'p4_{pid}_month_light.png',full_page=False)
            pg.click('[data-act=scope][data-val=year]'); pg.wait_for_timeout(700)
            r['year_tiles']=tiles(pg)
            r['year_B']=pg.eval_on_selector_all('#profB .prof-mrow','e=>e.map(x=>x.innerText.replace(/\\n/g," | "))')
            r['year_C_head']=pg.inner_text('#profC .prof-bigline')
            r['year_C_kv']=pg.inner_text('#profC .prof-kv').replace('\n',' | ')
            r['overflow_x']=pg.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth')
            pg.locator('#profileRoot').scroll_into_view_if_needed()
            pg.screenshot(path=OUT+f'p4_{pid}_year_light_top.png')
            pg.evaluate('document.getElementById("profB").scrollIntoView()'); pg.wait_for_timeout(200)
            pg.screenshot(path=OUT+f'p4_{pid}_year_light_B.png')
            pg.evaluate('document.getElementById("profC").scrollIntoView()'); pg.wait_for_timeout(200)
            pg.screenshot(path=OUT+f'p4_{pid}_year_light_C.png')
            # hide amounts
            pg.click('#profC [data-act=hide]'); pg.wait_for_timeout(200)
            r['hidden_class']=pg.evaluate('document.getElementById("profileRoot").classList.contains("prof-hide-amt")')
            r['hide_ls']=pg.evaluate('Object.keys(localStorage).filter(k=>k.includes("rppf_prof_hide")).map(k=>localStorage[k])')
            pg.screenshot(path=OUT+f'p4_{pid}_year_light_C_hidden.png')
            pg.click('#profC [data-act=hide]'); pg.wait_for_timeout(100)
            # dark theme
            pg.evaluate('document.documentElement.setAttribute("data-theme","dark")'); pg.wait_for_timeout(300)
            pg.evaluate('window.scrollTo(0,0);document.getElementById("page-profile").scrollTop=0'); 
            pg.screenshot(path=OUT+f'p4_{pid}_year_dark_top.png')
            pg.evaluate('document.getElementById("profB").scrollIntoView()'); pg.wait_for_timeout(200)
            pg.screenshot(path=OUT+f'p4_{pid}_year_dark_B.png')
            pg.evaluate('document.getElementById("profC").scrollIntoView()'); pg.wait_for_timeout(200)
            pg.screenshot(path=OUT+f'p4_{pid}_year_dark_C.png')
            pg.evaluate('document.documentElement.setAttribute("data-theme","light")')
            # last month + picker
            pg.evaluate('window.scrollTo(0,0)')
            pg.click('[data-act=scope][data-val=last]'); pg.wait_for_timeout(500)
            r['last_tiles']=tiles(pg)
            pg.select_option('[data-act=pick]','2025-12'); pg.wait_for_timeout(500)
            r['dec25_tiles']=tiles(pg) if pg.locator('#profA .prof-tile').count() else pg.inner_text('#profBody')[:300]
            r['dec25_B_rows']=pg.locator('#profB .prof-mrow').count()
        else:
            r['body']=pg.inner_text('#profBody')[:200]
        res[pid]=r
        ctx.close()
    b.close()
print(json.dumps(res,ensure_ascii=False,indent=1)); print('ERRORS:',errs)
