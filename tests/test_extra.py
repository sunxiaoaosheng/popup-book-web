import subprocess, time, sys
from playwright.sync_api import sync_playwright
from paths import BASE, shot_dir
out = shot_dir()
args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=args)
    pg = b.new_page(viewport={'width':1280,'height':800})
    errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('response', lambda r: errs.append(f'HTTP {r.status} {r.url}') if r.status>=400 else None)
    pg.goto(BASE + '?ws=ws://127.0.0.1:1')
    pg.wait_for_function('window.__popup')
    # closing: open to 100, then close down slowly -> yawn/sleep
    pg.evaluate('__popup.sweep(0,100,4)')
    pg.evaluate('__popup.settle(2)')
    pg.evaluate('__popup.sweep(104,96,1.0)')
    pg.evaluate('__popup.settle(0.5)')
    pg.screenshot(path=f'{out}/close_096_yawn.png')
    pg.evaluate('__popup.settle(3)')
    pg.screenshot(path=f'{out}/close_096_sleepy.png')
    print('S after close', pg.evaluate('JSON.stringify(Object.fromEntries(Object.entries(__popup.S).filter(([k,v])=>typeof v!=="object")))'))
    pg.evaluate('__popup.sweep(96,40,2)'); pg.evaluate('__popup.settle(1)')
    pg.screenshot(path=f'{out}/close_040.png')
    pg.evaluate('__popup.sweep(40,0,2)'); pg.evaluate('__popup.settle(3)')
    pg.screenshot(path=f'{out}/close_000.png')
    print(errs); b.close()
