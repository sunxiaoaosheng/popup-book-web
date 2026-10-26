"""v3「日晷」自检（无头 Chrome + SwiftShader）：python tests/test_v3.py
需要：本目录起静态服务 `python3 -m http.server 8123`。截图输出到 shots/v3/。
只验证逻辑与画面（太阳位置、光的方向、天色、时辰字幕）；真 GPU 下的观感未验证。"""
import sys
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = 'http://localhost:8123/index.html'
OUT = '/workspace/popup-book/shots/v3'
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
results, errs = [], []
def check(name, ok, info=''):
    results.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{BASE}?nostore=1&hud=0'); pg.wait_for_function('window.__popup', timeout=30000)
    ev = pg.evaluate
    D = {}
    for a in range(0, 131, 2):
        ev(f'__popup.setAngle({a}); __popup.settle(0.9)')   # <3 秒，不会触发停留彩蛋
        D[a] = ev('__popup.dbg()')
    check('合着/刚打开时看不到太阳（<30°）', not any(D[a]['sunVisible'] for a in range(0, 30, 2)))
    check('白天太阳在（50–100°）', all(D[a]['sunVisible'] for a in range(50, 101, 2)))
    check('天黑后太阳落下不见（≥122°）', not any(D[a]['sunVisible'] for a in range(122, 131, 2)))
    us = [D[a]['sunU'] for a in range(36, 113, 2)]
    check('开得越大，太阳走得越远（单调）', all(u2 >= u1 - 1e-3 for u1, u2 in zip(us, us[1:])))
    check('太阳从右边升起、往左边落下', D[50]['sunPos'][0] > 2 and D[100]['sunPos'][0] < -2, f"x50={D[50]['sunPos'][0]} x100={D[100]['sunPos'][0]}")
    peak = max(range(40, 111, 2), key=lambda a: D[a]['sunPos'][1])
    check('正午（最高点）在 70–78°', 70 <= peak <= 78, f'peak={peak}°')
    check('光从太阳那一侧照来（影子跟着扫）', D[50]['light'][0] > 5 and D[100]['light'][0] < -5, f"{D[50]['light']} → {D[100]['light']}")
    check('太阳越低光越低（黄昏影子更长）', D[106]['light'][1] < D[74]['light'][1] - 5, f"y74={D[74]['light'][1]} y106={D[106]['light'][1]}")
    check('正午光最强、黄昏变弱', D[74]['sunI'] > D[106]['sunI'] + 0.4)
    check('黄昏有地平线霞光，正午没有', D[106]['horizon'] > 0.3 and D[74]['horizon'] < 0.05, f"{D[106]['horizon']} / {D[74]['horizon']}")
    tods = []
    for a in range(36, 131, 2):
        t = D[a]['tod']
        if t and (not tods or tods[-1] != t): tods.append(t)
    check('时辰按 清晨→上午→正午→午后→黄昏→夜 推进', tods == ['清晨', '上午', '正午', '午后', '黄昏', '夜'], '→'.join(tods))
    ev('__popup.setAngle(74); __popup.settle(0.9)')
    check('字幕带时辰前缀', pg.inner_text('#caption').startswith('正午'), pg.inner_text('#caption'))
    # 猛地打开：纸太阳带弹簧过冲（会"甩"过头再回来）
    ev('__popup.setAngle(40); __popup.settle(2)'); us = []
    for i in range(40):
        ev(f'__popup.setAngle({40 + min(i, 8) * 5}); __popup.settle(1/60)'); us.append(ev('__popup.dbg().sunU'))
    target = (80 - 36) / (112 - 36)
    check('猛开时纸太阳有一点过冲（纸片手感）', max(us) > target + 0.01, f'max={max(us):.3f} target={target:.3f}')
    # 四季下太阳都正常
    for s in range(4):
        ev(f'__popup.forceSeason({s}); __popup.setAngle(100); __popup.settle(0.9)')
        check(f'季节 {s} 下太阳可见', ev('__popup.dbg().sunVisible'))
    pg.close()
    # 截图（新开页面：长时间跑完上面的扫描后，SwiftShader 下截图偶尔会卡住）
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{BASE}?nostore=1&hud=0'); pg.wait_for_function('window.__popup', timeout=30000); ev = pg.evaluate
    for a, nm in [(56, 'morning'), (74, 'noon'), (96, 'afternoon'), (108, 'dusk'), (126, 'night')]:
        ev(f'__popup.setAngle({a}); __popup.settle(1.5)'); pg.wait_for_timeout(100); pg.screenshot(path=f'{OUT}/sun_{a:03d}_{nm}.png')
    ev('__popup.forceSeason(2); __popup.setAngle(108); __popup.settle(2.5)'); pg.screenshot(path=f'{OUT}/sun_108_autumn_dusk.png')
    b.close()

ims = [Image.open(f'{OUT}/{f}.png').resize((640, 400)) for f in ['sun_056_morning', 'sun_074_noon', 'sun_096_afternoon', 'sun_108_dusk']]
c = Image.new('RGB', (1280, 800)); [c.paste(im, ((i % 2) * 640, (i // 2) * 400)) for i, im in enumerate(ims)]; c.save(f'{OUT}/contact_day.png')
check('全程无 JS 异常', not errs, '; '.join(errs[:3]))
bad = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(bad)}/{len(results)} 通过' + (f'；失败：{bad}' if bad else ''))
sys.exit(1 if bad else 0)
