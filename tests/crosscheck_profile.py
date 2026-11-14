"""Independent Python cross-check of profile totals (OT, night, holiday, earned, avg punch, issues)
against js/calculations/profile.js output computed in Node from the same data/*.json.
usage: python3 tests/crosscheck_profile.py   (needs node)"""
import json, glob, re, subprocess, sys, math, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
IDS = ['556490','CF2170','CF1181','CF2195','CF2193','CF2990']   # real, night, holiday, zero-issue, partial months, single-month
QA = ['556515']
def load(d):
    out={}
    for m in sorted(glob.glob(d+'/20*.json')):
        if re.search(r'\d{4}-\d{2}\.json$',m): out[m[-12:-5]]=json.load(open(m))['employees']
    return out
L=lambda v: v if isinstance(v,int) else len(v or [])
def mins(t):
    q=re.match(r'^(\d{1,2}):(\d{2})',str(t or '')); return int(q[1])*60+int(q[2]) if q else None
def run(ids,dept):
    env=dict(os.environ, DEPT=dept)
    return json.loads(subprocess.check_output(['node','tests/dump_profile.js']+ids,env=env))
def check(ids,dept,data):
    res=run(ids,dept); fails=0
    for i in ids:
        emps={ym:next((e for e in es if e['id']==i),None) for ym,es in data.items()}
        have={k:v for k,v in emps.items() if v}
        exp=dict(ot=round(sum(e['otHours'] for e in have.values()),2), night=sum(e['nightCount'] for e in have.values()),
                 hol=sum(e['holidayCount'] for e in have.values()), earned=sum(e['totalEarned'] for e in have.values()),
                 req=sum(L(e.get('requisitionProblems')) for e in have.values()), pp=sum(L(e.get('punchProblems')) for e in have.values()),
                 ns=sum(L(e.get('nightSuspects')) for e in have.values()))
        di=[];do=[]
        for e in have.values():
            for r in e['daily']:
                r=list(r)+[0]*(12-len(r)); a,b=mins(r[2]),mins(r[3])
                if a is None or b is None or a==0 or b==0: continue
                if r[10] or str(r[11]).upper() in ('DN',) or 'NIGHT' in str(r[11]).upper(): continue
                if b<=a: continue
                di.append(a);do.append(b)
        exp['avgIn']=sum(di)/len(di) if di else None; exp['avgOut']=sum(do)/len(do) if do else None
        t=res[i]['total']
        got=dict(ot=t['otHours'],night=t['nightCount'],hol=t['holidayCount'],earned=t['totalEarned'],req=t['issueCounts']['requisition'],pp=t['issueCounts']['punch'],ns=t['issueCounts']['nightSuspects'],avgIn=t['punch']['avgIn'],avgOut=t['punch']['avgOut'])
        ok=True
        for k,v in exp.items():
            g=got[k]
            same=(v is None and g is None) or (v is not None and g is not None and abs(v-g)<0.01)
            if not same: ok=False; print('  MISMATCH',i,k,'py',v,'js',g)
        months_js=[m['ym'] for m in res[i]['months'] if m['exists']]
        if months_js!=sorted(have): ok=False; print('  MONTH SET MISMATCH',i)
        print(('OK  ' if ok else 'FAIL'),dept,i,'months',len(have),'OT',got['ot'],'night',got['night'],'hol',got['hol'],'earned',got['earned'],'present%',t['presentPct'],'absent',t['absentDays'],'leave',t['leaveDays'])
        fails+= (not ok)
    return fails
f=check(IDS,'PR',load('data'))+check(QA,'QA',load('data/qa'))
print('FAILED' if f else 'ALL PASS'); sys.exit(1 if f else 0)
