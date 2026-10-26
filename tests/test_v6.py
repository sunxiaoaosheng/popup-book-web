"""v6「开着时换季」自检（无头 Chrome + SwiftShader）：python tests/test_v6.py
需要：静态页在 POPUP_BASE（默认 http://127.0.0.1:8123/index.html）。截图输出到 shots/v6/。
只验证逻辑与画面；真实合页传感器 / 真 GPU / 扬声器都未验证。"""
import sys
from playwright.sync_api import sync_playwright
from PIL import Image
from paths import BASE, shot_dir

OUT = shot_dir('v6')
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
results, errs = [], []
def check(name, ok, info=''):
    results.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''))

def page(b, q='nostore=1&hud=0'):
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{BASE}?{q}'); pg.wait_for_function('window.__popup', timeout=30000); return pg

def disarm_close(ev):
    """从任意角度安全合到 0，不触发换季（清掉 armed）。"""
    ev('__popup.S.armed = false; __popup.S.closing = false; __popup.setAngle(0); __popup.settle(0.7)')

def cycle_once(ev):
    """完整开合一次，推进季节。调用前应已在 0° 且未 armed。"""
    ev('__popup.S.armed = false; __popup.S.closing = false; __popup.setAngle(0); __popup.settle(0.4)')
    ev('__popup.sweep(0, 100, 1.1); __popup.settle(0.35)')
    ev('__popup.sweep(100, 0, 1.5); __popup.settle(1.0)')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = page(b); ev = pg.evaluate

    # ---------- 0. 初始春，dbg 字段 ----------
    d = ev('__popup.dbg()')
    for k in ('seasonFrom', 'seasonTo', 'seasonT', 'seasonMorphing', 'seasonMorphSaid'):
        check(f'dbg 含 {k}', k in d, str(list(d.keys())[-15:]))
    check('初始季节为春且未在 morph', d['season'] == 0 and d['seasonT'] >= 0.999 and not d['seasonMorphing'], str({k: d[k] for k in ('season','seasonT','seasonMorphing')}))

    # ---------- 1. 合上推进季节，但合着时 morph 未完成 ----------
    cycle_once(ev)
    d = ev('__popup.dbg()')
    check('合上后 cycles=1 season=1（夏）', d['cycles'] == 1 and d['season'] == 1, f"c={d['cycles']} s={d['season']}")
    check('合着时 seasonMorphing 仍进行中（t 未跑完）', d['seasonMorphing'] and d['seasonT'] < 0.15, f"t={d['seasonT']} morph={d['seasonMorphing']} from={d['seasonFrom']} to={d['seasonTo']}")
    check('合着时 from=春 to=夏', d['seasonFrom'] == 0 and d['seasonTo'] == 1, f"from={d['seasonFrom']} to={d['seasonTo']}")
    pg.screenshot(path=f'{OUT}/closed_pending.png')

    # ---------- 2. 低角度重开：morph 仍不完整 ----------
    ev('__popup.setAngle(18); __popup.settle(2)')
    d = ev('__popup.dbg()')
    check('18° 低于 morph 带，t 仍接近 0', d['seasonT'] < 0.08 and d['seasonMorphing'], f"A={d['A']} t={d['seasonT']}")
    pg.screenshot(path=f'{OUT}/morph_low.png')

    # ---------- 3. 开到 morph 带中段：t 随角度走 ----------
    ev('__popup.setAngle(40); __popup.settle(2)')
    d = ev('__popup.dbg()')
    check('40° morph 进度约 0.3–0.55', 0.28 <= d['seasonT'] <= 0.58, f"t={d['seasonT']} A={d['A']}")
    check('仍在 morphing', d['seasonMorphing'])
    check('换季字幕出现一次', d['seasonMorphSaid'] and '换季了' in (d.get('caption') or ''), f"said={d['seasonMorphSaid']} cap={d.get('caption')}")
    pg.screenshot(path=f'{OUT}/morph_mid.png')

    # ---------- 4. 再开到带外：morph 完成 ----------
    ev('__popup.setAngle(70); __popup.settle(2)')
    d = ev('__popup.dbg()')
    check('70° morph 完成', d['seasonT'] >= 0.999 and not d['seasonMorphing'], f"t={d['seasonT']} morph={d['seasonMorphing']}")
    check('完成后 season 仍是夏', d['season'] == 1 and d['seasonTo'] == 1, f"s={d['season']} to={d['seasonTo']}")
    pg.screenshot(path=f'{OUT}/morph_done.png')

    # ---------- 5. 猛开越过 band 也完成（夏→秋） ----------
    disarm_close(ev)
    cycle_once(ev)
    d = ev('__popup.dbg()')
    check('第二次合上 → 秋 pending', d['season'] == 2 and d['seasonMorphing'] and d['seasonFrom'] == 1 and d['seasonTo'] == 2,
          f"s={d['season']} from={d['seasonFrom']} to={d['seasonTo']} t={d['seasonT']} morph={d['seasonMorphing']}")
    ev('__popup.sweep(0, 90, 0.35); __popup.settle(0.6)')  # 猛开
    d = ev('__popup.dbg()')
    check('猛开越过 band 后 morph 完成', d['seasonT'] >= 0.999 and not d['seasonMorphing'] and d['season'] == 2, f"t={d['seasonT']} s={d['season']}")
    check('猛开时也说过换季字幕', d['seasonMorphSaid'])

    # ---------- 6. 同一次打开字幕不重复；?season= 瞬间 ----------
    ev('__popup.setAngle(45); __popup.settle(1); __popup.setAngle(50); __popup.settle(1)')
    check('完成后 seasonMorphSaid 仍 true（不重置）', ev('__popup.dbg().seasonMorphSaid'))

    pg2 = page(b, 'nostore=1&hud=0&season=3')
    d = pg2.evaluate('__popup.dbg()')
    check('?season=3 瞬间冬天、无 morph', d['season'] == 3 and d['seasonT'] >= 0.999 and not d['seasonMorphing'],
          f"s={d['season']} t={d['seasonT']} morph={d['seasonMorphing']}")
    pg2.close()

    # ---------- 7. 清晨 / 正午 / 黄昏回归 ----------
    ev('__popup.forceSeason(0); __popup.setAngle(0); __popup.settle(0.5)')
    ev('__popup.setAngle(45); __popup.settle(3)')
    d = ev('__popup.dbg()')
    check('清晨 dawnStretch 仍在', d['dawnStretch'] > 0.8, f"dawn={d['dawnStretch']} tod={d['tod']}")
    pg.screenshot(path=f'{OUT}/dawn_ok.png')

    ev('__popup.setAngle(86); __popup.settle(3)')
    d = ev('__popup.dbg()')
    check('正午 noonW 仍在', d['noonW'] > 0.8, f"noonW={d['noonW']}")
    pg.screenshot(path=f'{OUT}/noon_ok.png')

    ev('__popup.setAngle(104); __popup.settle(3)')
    d = ev('__popup.dbg()')
    check('黄昏看日落仍在', d['watchW'] > 0.8 and d['lookX'] < -0.3, f"watch={d['watchW']} lookX={d['lookX']}")
    pg.screenshot(path=f'{OUT}/dusk_ok.png')

    # ---------- 8. 春→夏 morph 中段特写：全新页面干净走一遍 ----------
    pg.close()
    pg = page(b); ev = pg.evaluate
    cycle_once(ev)
    ev('__popup.setAngle(42); __popup.settle(2.5)')
    d = ev('__popup.dbg()')
    check('特写帧仍在春→夏 morph', d['seasonMorphing'] and d['seasonFrom'] == 0 and d['seasonTo'] == 1,
          f"from={d['seasonFrom']} to={d['seasonTo']} t={d['seasonT']} s={d['season']} c={d['cycles']}")
    pg.screenshot(path=f'{OUT}/morph_spring_summer.png')

    b.close()

ims = []
for f in ['morph_low', 'morph_mid', 'morph_spring_summer', 'morph_done']:
    ims.append(Image.open(f'{OUT}/{f}.png').resize((640, 400)))
c = Image.new('RGB', (1280, 800))
for i, im in enumerate(ims): c.paste(im, ((i % 2) * 640, (i // 2) * 400))
c.save(f'{OUT}/contact_v6.png')

check('全程无 JS 异常', not errs, '; '.join(errs[:3]))
bad = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(bad)}/{len(results)} 通过' + (f'；失败：{bad}' if bad else ''))
sys.exit(1 if bad else 0)
