import subprocess, time
from playwright.sync_api import sync_playwright
from paths import BASE, BRIDGE, python_cmd, shot_dir
br = subprocess.Popen([python_cmd(), BRIDGE, '--fake'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(1.5)
args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=args)
    pg=b.new_page(viewport={'width':1280,'height':800}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_function('window.__popup')
    pg.wait_for_timeout(3500)
    print('dot on:', pg.evaluate("document.getElementById('dot').classList.contains('on')"),
          '| slider disabled:', pg.evaluate("document.getElementById('slider').disabled"),
          '| text:', pg.inner_text('#srcText'))
    a1=pg.evaluate('__popup.S.target'); pg.wait_for_timeout(1500); a2=pg.evaluate('__popup.S.target')
    print('angle moves:', a1, a2)
    pg.screenshot(path=shot_dir() + '/ws_connected.png')
    br.terminate(); pg.wait_for_timeout(2500)
    print('after bridge stop: dot on:', pg.evaluate("document.getElementById('dot').classList.contains('on')"), '| slider disabled:', pg.evaluate("document.getElementById('slider').disabled"))
    print('errs', errs); b.close()
print(br.stdout.read()[:300])
