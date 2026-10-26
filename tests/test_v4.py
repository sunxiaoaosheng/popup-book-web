"""v4「小猫的一天 + 陪它过完一整天」自检（无头 Chrome + SwiftShader）：python tests/test_v4.py
需要：本目录起静态服务 `python3 -m http.server 8123`。截图输出到 shots/v4/。
只验证逻辑与画面；真实合页传感器的手感（9 秒够不够慢）、真 GPU 观感、真实扬声器都未验证。"""
import sys
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = 'http://localhost:8123/index.html'
OUT = '/workspace/popup-book/shots/v4'
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
    # ---------- 1. 太快：不算，给一句含蓄提示 ----------
    pg = page(b); ev = pg.evaluate
    ev('__popup.setAngle(0); __popup.settle(1); __popup.sweep(0,128,8); __popup.settle(0.5)')
    d = ev('__popup.dbg()')
    check('8 秒开完（太快）不算一整天', not ev("__popup.store.hasSecret('fullday')"), f"dur={d['run']['dur']}")
    check('太快时给出"有点快"提示', '有点快' in d['caption'], d['caption'])
    check('没发现之前，夜里没有猫座', not d['conVisible'])
    # ---------- 2. 中途回头：不算 ----------
    ev('__popup.setAngle(0); __popup.settle(2); __popup.sweep(0,80,7); __popup.sweep(80,62,1.2); __popup.sweep(62,128,7); __popup.settle(0.5)')
    d = ev('__popup.dbg()')
    check('中途往回合了一段，不算一整天', not ev("__popup.store.hasSecret('fullday')") and d['run']['bad'] == 'back', str(d['run']))
    # ---------- 3. 猛开：不算 ----------
    ev('__popup.setAngle(0); __popup.settle(2); __popup.sweep(0,50,6); __popup.sweep(50,90,0.25); __popup.sweep(90,128,6); __popup.settle(0.5)')
    d = ev('__popup.dbg()')
    check('中途猛开一下，不算一整天', not ev("__popup.store.hasSecret('fullday')") and d['run']['bad'] == 'fast', str(d['run']))
    # ---------- 4. 慢慢、一路开到天黑：发现 + 猫座 ----------
    ev('__popup.setAngle(0); __popup.settle(2); __popup.sweep(0,128,14)')
    d = ev('__popup.dbg()')
    check('14 秒慢慢开到天黑 → 发现「陪它过完一整天」', ev("__popup.store.hasSecret('fullday')"), f"dur={d['run']['dur']} bad={d['run']['bad']!r}")
    check('发现时字幕提示天上多了一只猫', '多了一只猫' in d['caption'], d['caption'])
    check('手账总数变为 8', ev("document.getElementById('jbtn').textContent.endsWith('/8')"))
    ev('__popup.settle(1)'); c1 = ev('__popup.dbg().conP')
    ev('__popup.settle(3)'); d = ev('__popup.dbg()')
    check('猫座一颗一颗亮起来（不是瞬间出现）', 0.05 < c1 < 0.9 and d['conP'] > 0.99, f'1s={c1} 4s={d["conP"]}')
    pg.screenshot(path=f'{OUT}/fullday_night_catstars.png')
    # ---------- 5. 之后每个夜晚都在、白天不在 ----------
    ev('__popup.setAngle(74); __popup.settle(3)'); check('白天没有猫座', not ev('__popup.dbg().conVisible'))
    ev('__popup.setAngle(0); __popup.settle(3); __popup.setAngle(126); __popup.settle(4)')
    check('再开到夜里（普通速度），猫座还在', ev('__popup.dbg().conVisible') and ev('__popup.dbg().conP') > 0.99)
    pg.close()
    # ---------- 6. 小猫的一天：正午眯眼打喷嚏 ----------
    pg = page(b); ev = pg.evaluate
    ev('__popup.setAngle(86); __popup.settle(3)')
    d0 = ev('__popup.dbg()')
    ev('__popup.settle(7.5)'); d = ev('__popup.dbg()')
    check('正午小猫探头时眯眼（noonW 高）', d['kittenVisible'] and d['noonW'] > 0.8, f"tod={d['tod']} noonW={d['noonW']}")
    check('正午隔一会儿打一个小喷嚏', d['sneezes'] >= 1 and 'sneeze' in d['events'], f"sneezes={d['sneezes']}")
    check('第一次喷嚏有字幕', ev('__popup.S.sneezeSaid'))
    # 截到喷嚏那一刻
    for _ in range(60):
        if ev('__popup.settle(1/30); __popup.dbg().sneeze') > 0.6: break
    pg.screenshot(path=f'{OUT}/noon_sneeze.png'); kp = ev("__popup.project('kitten')")
    crop(f'{OUT}/noon_sneeze.png', f'{OUT}/noon_sneeze_zoom.png', kp['x'], kp['y'])
    ev('__popup.setAngle(60); __popup.settle(3)')
    check('上午（小猫还没出来）不打喷嚏、不眯眼', ev('__popup.dbg().noonW') < 0.05)
    # ---------- 7. 黄昏看日落、夜里看月亮 ----------
    ev('__popup.setAngle(104); __popup.settle(4)'); d = ev('__popup.dbg()')
    check('黄昏小猫转头看向左边落山的太阳', d['watchW'] > 0.8 and d['lookX'] < -0.3, f"watch={d['watchW']} lookX={d['lookX']} tod={d['tod']}")
    check('看日落 2 秒后出字幕', '太阳落山' in d['caption'], d['caption'])
    pg.screenshot(path=f'{OUT}/dusk_watch_sunset.png'); kp = ev("__popup.project('kitten')")
    crop(f'{OUT}/dusk_watch_sunset.png', f'{OUT}/dusk_watch_sunset_zoom.png', kp['x'] - 150, kp['y'] - 60, 640, 400)
    ev('__popup.setAngle(127); __popup.settle(4)'); d = ev('__popup.dbg()')
    check('夜里小猫抬头看右上的月亮', d['watchW'] > 0.8 and d['lookX'] > 0.2 and d['lookY'] > 0.1, f"lookX={d['lookX']} lookY={d['lookY']}")
    # 鼠标优先：有人晃鼠标时，猫看你
    pg.mouse.move(200, 600); pg.mouse.move(220, 620); ev('__popup.settle(1)')
    check('晃鼠标时仍然先看你', ev('__popup.dbg().lookX') < 0, str(ev('__popup.dbg().lookX')))
    # 四季都不报错
    for s in range(4):
        ev(f'__popup.forceSeason({s}); __popup.setAngle(86); __popup.settle(2); __popup.setAngle(106); __popup.settle(2)')
    b.close()

ims = [Image.open(f'{OUT}/{f}.png').resize((640, 400)) for f in ['noon_sneeze_zoom', 'dusk_watch_sunset_zoom', 'fullday_night_catstars', 'dusk_watch_sunset']]
c = Image.new('RGB', (1280, 800)); [c.paste(im, ((i % 2) * 640, (i // 2) * 400)) for i, im in enumerate(ims)]; c.save(f'{OUT}/contact_v4.png')
check('全程无 JS 异常', not errs, '; '.join(errs[:3]))
bad = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(bad)}/{len(results)} 通过' + (f'；失败：{bad}' if bad else ''))
sys.exit(1 if bad else 0)
