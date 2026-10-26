# 快速调试：python q.py "<js 每步>" ... ；每个参数 = "name|js"，执行后截图 shots/v2/name.png 并打印 dbg
import sys, json
from playwright.sync_api import sync_playwright
from paths import BASE, shot_dir
steps = sys.argv[1:]
out = shot_dir('v2')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
    pg = b.new_page(viewport={'width':1280,'height':800})
    logs = []
    pg.on('console', lambda m: logs.append(m.type+': '+m.text))
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
    pg.goto(BASE + '?nostore=1&hud=0')
    pg.wait_for_function('window.__popup', timeout=20000)
    for s in steps:
        name, js = s.split('|', 1)
        pg.evaluate(js)
        pg.wait_for_timeout(2200 if '//wait' in js else 150)
        pg.screenshot(path=f'{out}/{name}.png')
        d = pg.evaluate('(()=>{const d=__popup.dbg(); delete d.trees; return d})()')
        print(name, json.dumps(d, ensure_ascii=False))
    print('\n'.join(logs[:20]))
    b.close()
