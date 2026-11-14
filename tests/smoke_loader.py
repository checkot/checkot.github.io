# Browser check: profLoadHistory works against the real static server (Option A, then forced Option B for a QA-less id)
from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    b=p.chromium.launch(); cx=b.new_context(viewport={'width':390,'height':844}); pg=cx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html#/profile'); pg.wait_for_timeout(2500)
    r=pg.evaluate("""async()=>{
      const out={};
      const t0=performance.now(); let prog=[];
      const a=await profLoadHistory('556490',{wantedMonths:profMonthRange('2026-01','2026-11'),primaryMonth:'2026-11',onProgress:(d,t)=>prog.push(d+'/'+t)});
      out.A={source:a.source,months:Object.keys(a.months).filter(m=>a.months[m]).length,ms:Math.round(performance.now()-t0),prog:prog.slice(-2)};
      // Option B: block emp files
      return out;}""".replace("await pg.route;",""))
    print(json.dumps(r))
    # Option B: abort emp file requests
    hits=[]
    def blk(route):
        hits.append(route.request.url); route.fulfill(status=404, body='nf')
    cx.route('**/data/emp/**', blk)
    pg.evaluate("localStorage.clear()")
    r2=pg.evaluate("""async()=>{ const prog=[]; const t0=performance.now();
      const a=await profLoadHistory('556490',{wantedMonths:profMonthRange('2026-09','2026-11'),primaryMonth:'2026-11',onProgress:(d,t)=>prog.push(d+'/'+t)});
      const keys=Object.keys(localStorage).filter(k=>k.includes('rppf_prof_v1_'));
      return {source:a.source,months:Object.keys(a.months).filter(m=>a.months[m]),ms:Math.round(performance.now()-t0),prog,cacheKeys:keys,cacheKB:keys.map(k=>Math.round(localStorage[k].length/1024))}; }""")
    print(json.dumps(r2)); print('blocked emp requests:',len(hits),'pageerrors',errs)
    b.close()
