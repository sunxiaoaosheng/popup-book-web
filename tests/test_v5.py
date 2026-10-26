"""v5「清晨：窗后伸懒腰」自检（无头 Chrome + SwiftShader）：python tests/test_v5.py
需要：本目录起静态服务 `python3 -m http.server 8123`。截图输出到 shots/v5/。
只验证逻辑与画面；真实合页传感器 / 真 GPU / 扬声器都未验证。"""
import sys
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = 'http://localhost:8123/index.html'
OUT = '/workspace/popup-book/shots/v5'
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
results, errs = [], []
def check(name, ok, info=''):
    results.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''))

def page(b):
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{BASE}?nostore=1&hud=0'); pg.wait_for_function('window.__popup', timeout=30000); return pg

def crop(path, out, cx, cy, w=520, h=325):
    im = Image.open(path); x0 = max(0, min(1280 - w, int(cx - w / 2))); y0 = max(0, min(800 - h, int(cy - h / 2)))
    im.crop((x0, y0, x0 + w, y0 + h)).resize((w * 2, h * 2), Image.LANCZOS).save(out)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = page(b); ev = pg.evaluate

    # ---------- 1. ~45° 清晨：窗后伸懒腰可见 ----------
    ev('__popup.setAngle(0); __popup.settle(1); __popup.setAngle(45); __popup.settle(4)')
    # 多推几帧，让伸懒腰相位走到抬爪高峰（T*0.32 周期约 3 秒）
    best = 0
    for _ in range(90):
        ev('__popup.settle(1/30)')
        d = ev('__popup.dbg()'); best = max(best, d.get('dawnPose') or 0)
        if (d.get('dawnPose') or 0) > 0.7: break
    d = ev('__popup.dbg()')
    check('约 45° 清晨小猫可见', d['kittenVisible'], str(d.get('kittenPos')))
    check('dawnStretch 激活（窗后伸懒腰）', d['dawnStretch'] > 0.8, f"dawnStretch={d['dawnStretch']} tod={d['tod']} period={d.get('period')}")
    check('时段是清晨或上午', d['tod'] in ('清晨', '上午') and d.get('period') in ('清晨', '上午'), d['tod'])
    check('小猫在窗附近（x>0.4，不是门边负 x）', d['kittenPos'][0] > 0.4, str(d['kittenPos']))
    check('伸懒腰相位曾抬起过', best > 0.5, f'bestPose={best:.2f} now={d.get("dawnPose")}')
    # 等到抬爪明显时截图
    for _ in range(100):
        ev('__popup.settle(1/30)')
        if ev('__popup.dbg().dawnPose') > 0.65: break
    pg.screenshot(path=f'{OUT}/dawn_stretch.png')
    kp = ev("__popup.project('kitten')")
    crop(f'{OUT}/dawn_stretch.png', f'{OUT}/dawn_stretch_zoom.png', kp['x'], kp['y'] - 40, 420, 320)

    # ---------- 2. 停住 ~2.2s → 字幕一次 ----------
    ev('__popup.setAngle(0); __popup.settle(2); __popup.setAngle(48); __popup.settle(1)')
    # 停住超过 dawnHold
    ev('__popup.settle(2.8)')
    d = ev('__popup.dbg()')
    check('停在清晨窗带约 2.5s 后 dawnHeld', d['dawnHeld'], f"holdT={d['holdT']} band={d['holdBand']} cap={d['caption']}")
    check('字幕含「伸了个懒腰」', '伸了个懒腰' in d['caption'], d['caption'])
    # 再开一次合上重来，同一次打开不重复说（已 said）；合到 dayStart 以下才重置
    ev('__popup.settle(1)')
    cap1 = ev('__popup.dbg().caption')
    ev('__popup.setAngle(50); __popup.settle(3)')  # 仍在 band，hold 再触发但 dawnSaid 已 true，字幕可能过期
    check('同一次打开 dawnSaid 保持', ev('__popup.dbg().dawnSaid'))

    # ---------- 3. 正午：伸懒腰退场，正午逻辑仍在 ----------
    ev('__popup.setAngle(86); __popup.settle(4)')
    d = ev('__popup.dbg()')
    check('正午 dawnStretch 退场', d['dawnStretch'] < 0.05, f"dawn={d['dawnStretch']} noonW={d['noonW']}")
    check('正午小猫仍可见（门/窗台）', d['kittenVisible'])
    check('正午眯眼逻辑仍在', d['noonW'] > 0.8, f"noonW={d['noonW']} tod={d['tod']}")
    pg.screenshot(path=f'{OUT}/noon_regression.png')

    # ---------- 4. 黄昏：看日落仍在，无伸懒腰 ----------
    ev('__popup.setAngle(104); __popup.settle(4)')
    d = ev('__popup.dbg()')
    check('黄昏无 dawnStretch', d['dawnStretch'] < 0.05, str(d['dawnStretch']))
    check('黄昏仍看日落', d['watchW'] > 0.8 and d['lookX'] < -0.3, f"watch={d['watchW']} lookX={d['lookX']}")
    pg.screenshot(path=f'{OUT}/dusk_regression.png')

    # ---------- 5. 刚亮灯前（太低角度）不该窗后伸懒腰 ----------
    ev('__popup.setAngle(28); __popup.settle(3)')
    d = ev('__popup.dbg()')
    check('28° 小屋未立稳时不伸懒腰', d['dawnStretch'] < 0.05 and not d['kittenVisible'], f"dawn={d['dawnStretch']} vis={d['kittenVisible']}")

    # ---------- 6. dbg 字段齐全 ----------
    ev('__popup.setAngle(45); __popup.settle(3)')
    d = ev('__popup.dbg()')
    for k in ('dawnStretch', 'dawnHeld', 'dawnSaid', 'dawnPose', 'period'):
        check(f'dbg 含 {k}', k in d, str(list(d.keys())[-12:]))

    b.close()

ims = []
for f in ['dawn_stretch_zoom', 'dawn_stretch', 'noon_regression', 'dusk_regression']:
    ims.append(Image.open(f'{OUT}/{f}.png').resize((640, 400)))
c = Image.new('RGB', (1280, 800))
for i, im in enumerate(ims): c.paste(im, ((i % 2) * 640, (i // 2) * 400))
c.save(f'{OUT}/contact_v5.png')
check('全程无 JS 异常', not errs, '; '.join(errs[:3]))
bad = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(bad)}/{len(results)} 通过' + (f'；失败：{bad}' if bad else ''))
sys.exit(1 if bad else 0)
