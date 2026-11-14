"""Part 7 final verification (spec section 6). usage: python3 tests/verify_p7.py
Needs: python3 -m http.server 8765 running in the repo root. Writes docs/screens/p7_*.png and prints a JSON report.
Checks: no-ID empty state, unknown ID, 5 nav tabs light/dark, every profile section light/dark, overflow-x,
tap targets, console cleanliness, Me->Report->Back->Me, cold deep link, VS from More, offline (service worker)."""
import json, os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); os.chdir(ROOT)
BASE = 'http://localhost:8765/index.html'; SHOT = 'docs/screens/'
R = {}; FAILS = []
# sandbox has no internet: external CDN / font / firebase requests fail by design -> not our bug
def noise(t): return any(s in t for s in ('ERR_NAME_NOT_RESOLVED', 'ERR_INTERNET_DISCONNECTED', 'ERR_CONNECTION', 'Service Worker registration blocked', 'SW registration skipped', 'Failed to fetch', 'firebase', 'gstatic', 'googleapis'))
def check(name, ok, info=''):
    R[name] = bool(ok)
    if not ok: FAILS.append(name + (' :: ' + str(info) if info else ''))
def theme(pg, t): pg.evaluate("t=>applyTheme(t)", t); pg.wait_for_timeout(250)
def new(b, sw='block'):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers=sw)
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append((m.type, m.text[:200])) if m.type in ('error', 'warning') and not noise(m.text) else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e)[:200])))
    return ctx, pg, errs
def boot(pg, url=BASE):
    pg.goto(url); pg.wait_for_timeout(2200)
    if pg.evaluate('document.getElementById("modeSetupModal").classList.contains("open")'):
        pg.click('#modeModalCloseBtn'); pg.wait_for_timeout(300)
def open_profile(pg, pid, scope='year'):
    pg.click('.bottom-nav [data-nav=profile]')
    if pg.locator('#profIdInput').count(): pg.fill('#profIdInput', pid); pg.click('#profSaveIdBtn')
    pg.wait_for_selector('#profBody .prof-card:not(.prof-skel-card)', timeout=25000)
    pg.click('[data-act=scope][data-val=%s]' % scope); pg.wait_for_selector('#profG', timeout=25000); pg.wait_for_timeout(1000)
def overflow(pg): return pg.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')
def small_targets(pg):
    return pg.evaluate("""()=>[...document.querySelectorAll('#page-profile button, #page-profile [role=button], #page-profile a, #page-profile summary, .bottom-nav .bn-item')]
      .filter(e=>!e.classList.contains('theme-toggle'))  // app-wide pre-existing header control (48x26 pill), not part of this feature
      .filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<43.5||r.width<43.5)})
      .map(e=>[(e.id||e.className||e.tagName).toString().slice(0,40),Math.round(e.getBoundingClientRect().width),Math.round(e.getBoundingClientRect().height)])""")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ---- 1. no saved ID: nav + empty state, light & dark ----
    ctx, pg, errs = new(b); boot(pg)
    nav = pg.eval_on_selector_all('.bottom-nav .bn-item', 'els=>els.map(e=>e.dataset.nav)')
    R['nav_order'] = nav; check('nav_order_ok', nav == ['search', 'report', 'profile', 'leaderboard', 'more'], nav)
    check('landing_is_home', pg.evaluate('document.getElementById("page-search").classList.contains("active")'))
    for t in ('light', 'dark'):
        theme(pg, t)
        for tab in ('search', 'report', 'profile', 'leaderboard', 'more'):
            pg.click('.bottom-nav [data-nav=%s]' % tab); pg.wait_for_timeout(700)
            act = pg.eval_on_selector_all('.bottom-nav .bn-item.active', 'e=>e.map(x=>x.dataset.nav)')
            cur = pg.eval_on_selector_all('.bottom-nav .bn-item[aria-current]', 'e=>e.map(x=>x.dataset.nav)')
            check('nav_active_%s_%s' % (tab, t), act == [tab] and cur == [tab], (act, cur))
            pg.screenshot(path=SHOT + 'p7_nav_%s_%s.png' % (tab, t))
            if tab == 'profile':
                check('empty_state_%s' % t, pg.locator('#profIdInput').count() == 1 and pg.locator('#profSaveIdBtn').count() == 1)
                check('empty_no_overflow_%s' % t, not overflow(pg))
    # unknown ID
    theme(pg, 'light'); pg.click('.bottom-nav [data-nav=profile]'); pg.fill('#profIdInput', 'ZZ99999'); pg.click('#profSaveIdBtn')
    pg.wait_for_timeout(6000)
    txt = pg.inner_text('#page-profile')
    check('unknown_id_message', ('not found' in txt.lower()) or ('পাওয়া যায়নি' in txt), txt[:160])
    check('unknown_id_no_blank', len(txt.strip()) > 40)
    pg.screenshot(path=SHOT + 'p7_unknown_id.png')
    # an unknown ID has no data/emp file -> the designed 404 fallback to Option B; anything else is a real error
    real = [e for e in errs if not (e[0] == 'error' and '404' in e[1])]
    R['unknown_id_expected_404s'] = len(errs) - len(real)
    check('no_console_errors_noid', not real, real); ctx.close()

    # ---- 2. real employees: every section, light + dark ----
    SECTIONS = ['profA', 'profB', 'profI1', 'profC', 'profD', 'profE', 'profF', 'profH', 'profI2', 'profG', 'profI3']
    for pid in ('556490', 'CF2170', 'CF2195', '556515'):
        ctx, pg, errs = new(b); boot(pg); open_profile(pg, pid)
        R['sections_%s' % pid] = {}
        # section E/F have no fixed id: locate by heading text
        for t in ('light', 'dark'):
            theme(pg, t)
            check('no_overflow_%s_%s' % (pid, t), not overflow(pg))
            pg.evaluate('window.scrollTo(0,0)')
            pg.screenshot(path=SHOT + 'p7_%s_top_%s.png' % (pid, t))
            for sid in SECTIONS:
                loc = pg.locator('#' + sid)
                if loc.count():
                    loc.first.scroll_into_view_if_needed(); pg.wait_for_timeout(120)
                    loc.first.screenshot(path=SHOT + 'p7_%s_%s_%s.png' % (pid, sid, t)); R['sections_%s' % pid][sid] = True
                else: R['sections_%s' % pid][sid] = False
        for must in ('profA', 'profB', 'profC', 'profD', 'profH', 'profG'):
            check('section_%s_%s' % (must, pid), R['sections_%s' % pid][must])
        st = small_targets(pg); R['small_targets_%s' % pid] = st
        check('tap_targets_%s' % pid, not st, st)
        # hide-amounts toggle blurs money and persists
        if pid == '556490':
            pg.evaluate('window.scrollTo(0,0)')
            btn = pg.locator('#page-profile [data-act=hide]')
            if btn.count():
                btn.first.click(); pg.wait_for_timeout(300)
                blurred = pg.evaluate("()=>{const e=document.querySelector('#page-profile .prof-amt');return e?getComputedStyle(e).filter:'none'}")
                check('hide_amounts_blurs', 'blur' in blurred, blurred)
                check('hide_amounts_persisted', pg.evaluate("()=>Object.keys(localStorage).some(k=>k.indexOf('rppf_prof_hide')>-1&&localStorage[k]==='1')"))
                pg.screenshot(path=SHOT + 'p7_556490_hidden_amounts.png'); btn.first.click()
            else: check('hide_amounts_btn_found', False)
        # scope chips
        for sc in ('cur', 'last', 'year'):
            R['chip_' + sc] = pg.locator('[data-act=scope][data-val=%s]' % sc).count()
            check('chip_present_' + sc, R['chip_' + sc] == 1)
        check('no_console_errors_%s' % pid, not errs, errs); ctx.close()

    # ---- 3. flow: Me -> Report -> Back -> Me, deep link, VS from More ----
    ctx, pg, errs = new(b); boot(pg); open_profile(pg, '556490', 'cur')
    pg.click('.bottom-nav [data-nav=report]'); pg.wait_for_timeout(700)
    check('flow_report_hash', pg.evaluate('location.hash').startswith('#/report'))
    pg.go_back(); pg.wait_for_timeout(800)
    check('flow_back_to_me', pg.evaluate('location.hash') == '#/profile' and pg.evaluate('document.getElementById("page-profile").classList.contains("active")'))
    pg.click('.bottom-nav [data-nav=more]'); pg.wait_for_timeout(500)
    pg.click('#page-more .more-item:has-text("VS (1v1)")'); pg.wait_for_timeout(900)
    check('vs_routable', pg.evaluate('location.hash') == '#/vs' and pg.evaluate('document.getElementById("page-vs").classList.contains("active")'))
    check('vs_highlights_more', pg.eval_on_selector_all('.bottom-nav .bn-item.active', 'e=>e.map(x=>x.dataset.nav)') == ['more'])
    check('flow_no_errors', not errs, errs); ctx.close()
    ctx, pg, errs = new(b); boot(pg, BASE + '#/profile')
    check('deeplink_profile_active', pg.evaluate('document.getElementById("page-profile").classList.contains("active")'))
    ctx.close()

    # ---- 4. offline via service worker ----
    ctx, pg, errs = new(b, sw='allow'); boot(pg); open_profile(pg, 'CF2170', 'year')
    online_text = pg.inner_text('#profA')[:200]
    pg.wait_for_timeout(2500)
    sw_ready = pg.evaluate("async()=>{try{const r=await navigator.serviceWorker.ready;return !!r.active}catch(e){return false}}")
    R['sw_active'] = sw_ready; check('sw_active', sw_ready)
    pg.reload(); pg.wait_for_timeout(2500)  # now controlled by SW
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_timeout(3500)
    if pg.evaluate('document.getElementById("modeSetupModal").classList.contains("open")'): pg.click('#modeModalCloseBtn')
    pg.goto(BASE + '#/profile'); pg.wait_for_timeout(1500)
    try:
        pg.wait_for_selector('#profBody .prof-card:not(.prof-skel-card)', timeout=15000)
        off = pg.inner_text('#page-profile')
        check('offline_profile_renders', len(off) > 200, off[:120])
        check('offline_shell_loads', True)
        R['offline_has_hero'] = pg.locator('#profA').count() == 1
        pg.screenshot(path=SHOT + 'p7_offline_profile.png')
    except Exception as e:
        R['offline_error'] = str(e)[:200]
        pg.screenshot(path=SHOT + 'p7_offline_profile.png'); check('offline_profile_renders', False, str(e)[:120])
    ctx.set_offline(False); ctx.close(); b.close()

print(json.dumps(R, indent=1, ensure_ascii=False))
print('FAILS:', FAILS if FAILS else 'none'); print('ALL PASS' if not FAILS else 'SOME FAILED')
sys.exit(1 if FAILS else 0)
