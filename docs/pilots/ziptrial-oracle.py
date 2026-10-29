import json, subprocess, sys, tempfile, zipfile
from pathlib import Path
repo=Path(sys.argv[1]); cases=[]
def call(*args): return subprocess.run([sys.executable,'-m','ziptrial',*map(str,args)],cwd=repo,capture_output=True,text=True)
with tempfile.TemporaryDirectory() as d:
 root=Path(d);artifact=root/'sample.zip'
 with zipfile.ZipFile(artifact,'w') as z:z.writestr('app.py',"print('ok')\n")
 r=call('inspect',artifact);assert r.returncode==0,r.stderr;assert isinstance(json.loads(r.stdout),dict);assert len(r.stdout.strip().splitlines())>1;cases.append('default pretty JSON')
 r=call('inspect',artifact,'--quiet');assert r.returncode==0,r.stderr;assert r.stdout=='';cases.append('quiet inspection')
 r=call('inspect',artifact,'--compact');assert r.returncode==2;cases.append('compact removed')
 manifest=root/'manifest.json';manifest.write_text(json.dumps({'version':1,'name':'pilot','required_files':['app.py'],'checks':[{'id':'smoke','argv':['{python}','app.py'],'stdout_contains':['ok']}]}))
 output=root/'output';r=call('run',artifact,'--manifest',manifest,'--output',output,'--quiet');assert r.returncode==0,r.stderr;assert r.stdout=='';assert (output/'report.json').is_file();assert json.loads((output/'report.json').read_text())['status']=='passed';assert (output/'review.md').is_file();cases.append('quiet run retains report files')
 artifact.write_bytes(b'bad');r=call('inspect',artifact,'--quiet');assert r.returncode==2;assert 'ZipTrial:' in r.stderr;assert r.stdout=='';cases.append('error diagnostics')
print(json.dumps({'passed':True,'cases':cases}))
