import subprocess, time
from playwright.sync_api import sync_playwright
br = subprocess.Popen(['/workspace/venv/bin/python','/workspace/popup-book/bridge.py','--fake'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
time.sleep(1.5)
args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=args)
    pg=b.new_page(viewport={'width':1280,'height':800}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8123/index.html'); pg.wait_for_function('window.__popup')
    pg.wait_for_timeout(3500)
    print('dot on:', pg.evaluate("document.getElementById('dot').classList.contains('on')"),
          '| slider disabled:', pg.evaluate("document.getElementById('slider').disabled"),
          '| text:', pg.inner_text('#srcText'))
    a1=pg.evaluate('__popup.S.target'); pg.wait_for_timeout(1500); a2=pg.evaluate('__popup.S.target')
    print('angle moves:', a1, a2)
    pg.screenshot(path='/workspace/popup-book/shots/ws_connected.png')
    br.terminate(); pg.wait_for_timeout(2500)
    print('after bridge stop: dot on:', pg.evaluate("document.getElementById('dot').classList.contains('on')"), '| slider disabled:', pg.evaluate("document.getElementById('slider').disabled"))
    print('errs', errs); b.close()
print(br.stdout.read()[:300])
