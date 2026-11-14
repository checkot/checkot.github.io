# Report page still renders through shared computeEmpMonthRows
from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html#/report'); pg.wait_for_timeout(2500)
    r=pg.evaluate("""async()=>{
      const f=await fetch('data/2026-11.json').then(r=>r.json());
      const e=f.employees.find(x=>x.id==='556490');
      const out=computeEmpMonthRows({emp:e,month:'2026-11'});
      const viaReport=_rptRows({emp:e,month:'2026-11'});
      return {fn:typeof computeEmpMonthRows, rows:out.rows.length, same:JSON.stringify(out)===JSON.stringify(viaReport), html:(typeof _rptHtml==='function')?_rptHtml({emp:e,month:'2026-11',id:e.id},false).length:0}
    }""")
    print(json.dumps(r), 'pageerrors:',errs)
    b.close()
