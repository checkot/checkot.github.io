import json, sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:8765/index.html'
res={}; errs=[]
with sync_playwright() as pw:
    b=pw.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,service_workers='block')
    pg=ctx.new_page()
    pg.on('console',lambda m: errs.append((m.type,m.text[:200])) if m.type in('error','warning') else None)
    pg.on('pageerror',lambda e: errs.append(('pageerror',str(e)[:200])))
    pg.goto(BASE); pg.wait_for_timeout(2500)
    res['first_run_modal_open']=pg.evaluate('document.getElementById("modeSetupModal").classList.contains("open")')
    if res['first_run_modal_open']: pg.click('#modeModalCloseBtn'); pg.wait_for_timeout(300)
    nav=pg.eval_on_selector_all('.bottom-nav .bn-item','els=>els.map(e=>[e.dataset.nav,e.innerText.trim(),e.classList.contains("active")])')
    res['nav_initial']=nav
    pg.screenshot(path='/home/claude/repo/checkot.github.io-main/docs/screens/p1_nav_home.png')
    # Me tab (no id)
    pg.click('.bottom-nav [data-nav=profile]'); pg.wait_for_timeout(600)
    res['hash_after_me']=pg.evaluate('location.hash')
    res['empty_state']=pg.locator('#profIdInput').count()==1
    res['active_after_me']=pg.eval_on_selector_all('.bottom-nav .bn-item.active','e=>e.map(x=>x.dataset.nav)')
    res['aria_current']=pg.eval_on_selector_all('.bottom-nav .bn-item[aria-current]','e=>e.map(x=>x.dataset.nav)')
    pg.screenshot(path='/home/claude/repo/checkot.github.io-main/docs/screens/p1_me_empty.png')
    # save an id
    pg.fill('#profIdInput','556490'); pg.click('#profSaveIdBtn'); pg.wait_for_timeout(500)
    res['placeholder_after_save']=pg.inner_text('#profileRoot')[:60]
    res['saved_id']=pg.evaluate('getPreferredId()')
    # Report tab then back
    pg.click('.bottom-nav [data-nav=report]'); pg.wait_for_timeout(500)
    res['active_report']=pg.eval_on_selector_all('.bottom-nav .bn-item.active','e=>e.map(x=>x.dataset.nav)')
    pg.go_back(); pg.wait_for_timeout(600)
    res['after_back_hash']=pg.evaluate('location.hash')
    res['after_back_active']=pg.eval_on_selector_all('.bottom-nav .bn-item.active','e=>e.map(x=>x.dataset.nav)')
    # More -> VS
    pg.click('.bottom-nav [data-nav=more]'); pg.wait_for_timeout(500)
    res['more_has_vs']=pg.locator('#page-more .more-item:has-text("VS (1v1)")').count()
    pg.screenshot(path='/home/claude/repo/checkot.github.io-main/docs/screens/p1_more_list.png')
    pg.click('#page-more .more-item:has-text("VS (1v1)")'); pg.wait_for_timeout(800)
    res['vs_hash']=pg.evaluate('location.hash')
    res['vs_page_active']=pg.evaluate('document.getElementById("page-vs").classList.contains("active")')
    res['vs_active_nav']=pg.eval_on_selector_all('.bottom-nav .bn-item.active','e=>e.map(x=>x.dataset.nav)')
    pg.screenshot(path='/home/claude/repo/checkot.github.io-main/docs/screens/p1_vs_from_more.png')
    # Rank
    pg.click('.bottom-nav [data-nav=leaderboard]'); pg.wait_for_timeout(1200)
    res['rank_active']=pg.eval_on_selector_all('.bottom-nav .bn-item.active','e=>e.map(x=>x.dataset.nav)')
    # Me again with id
    pg.click('.bottom-nav [data-nav=profile]'); pg.wait_for_timeout(600)
    res['me_with_id']=pg.inner_text('#profileRoot')[:30]
    res['me_active']=pg.eval_on_selector_all('.bottom-nav .bn-item.active','e=>e.map(x=>x.dataset.nav)')
    ctx.close()
    # cold-start deep link
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,service_workers='block')
    pg2=ctx.new_page(); pg2.on('pageerror',lambda e: errs.append(('pageerror2',str(e)[:200])))
    pg2.goto(BASE+'#/profile'); pg2.wait_for_timeout(2500)
    res['deeplink_modal_open']=pg2.evaluate('document.getElementById("modeSetupModal").classList.contains("open")')
    if res['deeplink_modal_open']: pg2.click('#modeModalCloseBtn'); pg2.wait_for_timeout(300)
    res['deeplink_page_active']=pg2.evaluate('document.getElementById("page-profile").classList.contains("active")')
    res['deeplink_active_nav']=pg2.eval_on_selector_all('.bottom-nav .bn-item.active','e=>e.map(x=>x.dataset.nav)')
    res['deeplink_empty']=pg2.locator('#profIdInput').count()==1
    ctx.close()
    # desktop topnav
    ctx=b.new_context(viewport={'width':1280,'height':800},service_workers='block')
    pg3=ctx.new_page(); pg3.goto(BASE); pg3.wait_for_timeout(2000)
    if pg3.evaluate('document.getElementById("modeSetupModal").classList.contains("open")'): pg3.click('#modeModalCloseBtn'); pg3.wait_for_timeout(300)
    res['topnav']=pg3.eval_on_selector_all('.topnav-menu .topnav-item','e=>e.map(x=>x.innerText.trim())')
    pg3.click('.topnav-item[data-nav=profile]'); pg3.wait_for_timeout(500)
    res['topnav_profile_active']=pg3.evaluate('document.getElementById("page-profile").classList.contains("active")')
    b.close()
res['console']=errs
print(json.dumps(res,indent=1,ensure_ascii=False))
