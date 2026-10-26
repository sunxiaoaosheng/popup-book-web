import sys, asyncio, subprocess, time, os
from playwright.sync_api import sync_playwright
from paths import BASE, shot_dir
angles = [float(a) for a in sys.argv[1].split(',')]
suffix = sys.argv[2] if len(sys.argv)>2 else ''
out = shot_dir()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
    pg = b.new_page(viewport={'width':1280,'height':800})
    logs=[]
    pg.on('console', lambda m: logs.append(m.type+': '+m.text))
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
    pg.goto(BASE)
    pg.wait_for_function('window.__popup')
    for a in angles:
        pg.evaluate(f'__popup.setAngle({a}); __popup.settle(5)')
        pg.screenshot(path=f'{out}/angle_{int(a):03d}{suffix}.png')
    print('\n'.join(logs[:20]))
    b.close()
