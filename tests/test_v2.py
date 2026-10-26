"""v2 全量自检（无头 Chrome + SwiftShader）：python tests/test_v2.py
需要：静态页在 POPUP_BASE（默认 http://127.0.0.1:8123/index.html），例如
`./start.sh --slider --port 8123 --no-docker`，以及装了 playwright 的 python。
截图输出到 shots/v2/，末尾打印 PASS/FAIL 汇总；任何 JS 异常都会让整体失败。"""
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright
from paths import BASE, BRIDGE, python_cmd, shot_dir

OUT = shot_dir('v2')
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''))

errs = []
def new_page(b, query='nostore=1&hud=0', w=1280, h=800):
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'WebSocket' not in m.text and 'ERR_CONNECTION' not in m.text else None)
    pg.goto(f'{BASE}?{query}'); pg.wait_for_function('window.__popup', timeout=30000)
    return pg
def ev(pg, js): return pg.evaluate(js)
def dbg(pg): return ev(pg, '__popup.dbg()')
def shot(pg, name): pg.wait_for_timeout(120); pg.screenshot(path=f'{OUT}/{name}.png')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)

    # ---------- 1. 基础：各角度截图 + 后排树完成时间 ----------
    pg = new_page(b)
    rows = {}
    for a in range(0, 131, 5):
        ev(pg, f'__popup.setAngle({a}); __popup.settle(2.5)')
        for t in dbg(pg)['trees']: rows.setdefault(t['row'], {}).setdefault(a, []).append(t['q'])
        if a in (0, 20, 30, 45, 55, 65, 90, 115, 130): shot(pg, f'angle_{a:03d}')
    done = {r: next(a for a in sorted(v) if min(v[a]) > 0.98) for r, v in rows.items()}
    check('后排树在 ≤50° 前完全立起', done['back'] <= 50, f'完成角度 {done}')
    check('所有树在 ≤55° 前完全立起', max(done.values()) <= 55)
    pg.close()

    # ---------- 2. 四季 ----------
    pg = new_page(b)
    for i, nm in enumerate(['spring', 'summer', 'autumn', 'winter']):
        ev(pg, f'__popup.forceSeason({i}); __popup.setAngle(100); __popup.settle(4)')
        shot(pg, f'season_{i}_{nm}')
        check(f'季节 {nm} 切换', dbg(pg)['season'] == i)
    pg.close()

    # ---------- 3. 速度敏感 ----------
    pg = new_page(b)
    ev(pg, '__popup.sweep(0,95,13); __popup.settle(1.2)')
    d = dbg(pg); shot(pg, 'speed_slow_shy')
    check('慢慢打开 → 小猫害羞探头', d['shy'] > 0.5 and d['kittenVisible'], f"shy={d['shy']}")
    check('慢开不会惊飞猫头鹰', d['owl'] == 'perched')
    pg.close()
    pg = new_page(b)
    ev(pg, '__popup.setAngle(0); __popup.settle(1); __popup.sweep(0,100,0.5); __popup.settle(0.15)')
    d = dbg(pg); shot(pg, 'speed_fast_flutter')
    check('猛地打开 → 纸张抖动', d['flutT'] > 0.1, f"flutT={d['flutT']}")
    check('猛地打开 → 猫头鹰惊飞', d['owl'] == 'out' and 'flap' in d['events'])
    ev(pg, '__popup.settle(0.5)'); shot(pg, 'speed_fast_owl_gone')
    ev(pg, '__popup.settle(16)'); check('猫头鹰飞走约 10 秒后飞回来', dbg(pg)['owl'] in ('perched', 'in'), dbg(pg)['owl'])
    # 晃动
    ev(pg, '__popup.setAngle(90); __popup.settle(3); __popup.wiggle(90,6,5,1.1)')
    d = dbg(pg); shot(pg, 'speed_shake_burst')
    check('快速晃动 → 抖落花瓣/树叶', d['burstT'] > 0.2 and any(e.startswith('shake') for e in d['events']), f"burstT={d['burstT']}")
    pg.close()

    # ---------- 4. 停住不动的彩蛋 ----------
    pg = new_page(b)
    ev(pg, '__popup.sweep(0,8,3); __popup.settle(3.6)'); d = dbg(pg); shot(pg, 'hold_seam_eyes')
    check('合缝处停 3 秒 → 缝里有眼睛', d['act']['seam'] and d['seamEye'] > 0.6, f"seamEye={d['seamEye']}")
    ev(pg, '__popup.sweep(8,60,5); __popup.settle(4.5)'); d = dbg(pg); shot(pg, 'hold_nap_chimney')
    check('~60° 停 3 秒 → 小猫在烟囱旁睡觉', d['act']['nap'] and d['napP'] > 0.95, f"napP={d['napP']}")
    ev(pg, '__popup.sweep(60,112,5); __popup.settle(5)'); d = dbg(pg); shot(pg, 'hold_chase_fireflies')
    check('~110° 停 3 秒 → 小猫追萤火虫', d['act']['chase'] and d['chaseP'] > 0.95, f"chaseP={d['chaseP']}")
    check('三个停留彩蛋记入手账', dbg(pg)['found'] >= 3, f"found={dbg(pg)['found']}")
    pg.close()

    # ---------- 5. 合上：晚安 / 摔门，季节推进 ----------
    pg = new_page(b)
    ev(pg, '__popup.setAngle(100); __popup.settle(3); __popup.sweep(100,0,7); __popup.settle(2.5)')
    pg.wait_for_timeout(2200); d = dbg(pg); shot(pg, 'close_gentle_goodnight')
    check('轻轻合上 → 晚安结尾', d['ending'] == 'gentle' and ev(pg, '__popup.ui.endingVisible()'))
    check('合上一次 → 季节推进、次数 +1', d['cycles'] == 1 and d['season'] == 1, f"cycles={d['cycles']} season={d['season']}")
    ev(pg, '__popup.sweep(0,40,2)'); check('再翻开 → 晚安消失', not ev(pg, '__popup.ui.endingVisible()'))
    ev(pg, '__popup.setAngle(110); __popup.settle(3); __popup.sweep(110,0,0.3); __popup.settle(0.6)')
    d = dbg(pg); shot(pg, 'close_slam')
    check('用力合上 → 啪（不出晚安）', d['ending'] == 'slam' and 'thud' in d['events'] and not ev(pg, '__popup.ui.endingVisible()'))
    check('第二次合上 → 秋天', d['cycles'] == 2 and d['season'] == 2)
    pg.close()

    # ---------- 6. 鼠标/触控 ----------
    pg = new_page(b)
    ev(pg, '__popup.sweep(0,100,6); __popup.settle(3)')
    ev(pg, '__popup.S.shy = 0'); ev(pg, '__popup.settle(1)')
    pt = ev(pg, '__popup.project("kitten")'); pg.mouse.move(pt['x'], pt['y']); pg.wait_for_timeout(150); pg.mouse.move(pt['x'] + 1, pt['y'] + 1); pg.wait_for_timeout(150)
    hv = dbg(pg)['hover']
    pg.mouse.down(); pg.wait_for_timeout(100)
    ev(pg, '__popup.settle(1.5)'); d = dbg(pg); shot(pg, 'mouse_pet_kitten')
    check('鼠标悬停小猫能识别', hv == 'kitten', hv)
    check('按住小猫 → 呼噜 + 开心', 'purr-on' in d['events'] and d['petE'] > 0.2, f"petE={d['petE']}")
    pg.mouse.up(); ev(pg, '__popup.settle(0.3)'); check('松手 → 呼噜停止', 'purr-off' in dbg(pg)['events'])
    ow = ev(pg, '__popup.project("owl")'); pg.mouse.click(ow['x'], ow['y']); ev(pg, '__popup.settle(0.4)')
    check('点猫头鹰 → 飞走', dbg(pg)['owl'] == 'out', dbg(pg)['owl'])
    ev(pg, '__popup.settle(0.2)'); shot(pg, 'mouse_owl_startle')
    pg.close()

    # ---------- 7. 持久化 / 静音 ----------
    pg = new_page(b, 'reset=1')
    ev(pg, '__popup.setAngle(100); __popup.settle(3); __popup.sweep(100,0,7); __popup.settle(2)')
    d = dbg(pg); f0 = d['found']
    pg.goto(f'{BASE}'); pg.wait_for_function('window.__popup'); d2 = dbg(pg)
    check('刷新后 次数/小秘密/季节 都还在', d2['cycles'] == 1 and d2['found'] == f0 and d2['season'] == 1 and f0 >= 1, f"{d2['cycles']},{d2['found']},{d2['season']}")
    pg.click('#jbtn'); shot(pg, 'journal_panel')
    check('手账面板显示发现数', f'{f0} / 8' in pg.inner_text('#journal'))
    pg.click('#jbtn')
    pg.click('#snd'); check('音效按钮可静音并写入存档', ev(pg, '__popup.store.muted === true && __popup.sound.muted === true'))
    pg.goto(f'{BASE}'); pg.wait_for_function('window.__popup'); check('静音状态刷新后保留', ev(pg, '__popup.sound.muted === true'))
    ev(pg, 'localStorage.clear()'); pg.close()

    # ---------- 8. 音频（离线渲染，证明合成出来的不是静音） ----------
    pg = new_page(b)
    au = ev(pg, '__popup.audioProbe()')
    print('音频探针:', json.dumps(au))
    for k, v in au.items(): check(f'音频 {k} 有声音', v['peak'] > 0.01, f"peak={v['peak']} rms={v['rms']}")
    check('页面加载时不自动出声（需手势）', ev(pg, '__popup.sound.running') is False)
    pg.mouse.click(300, 300); pg.wait_for_timeout(300)
    check('点击后音频上下文启动', ev(pg, '__popup.sound.running') is True)
    pg.close()

    # ---------- 9. 性能粗测（仅 update 的 CPU 耗时，仅作参考） ----------
    pg = new_page(b)
    ev(pg, '__popup.setAngle(100); __popup.settle(2)')
    ms = ev(pg, '(()=>{const t=performance.now();for(let i=0;i<120;i++)__popup.S&&__popup.settle(1/60);return (performance.now()-t)/120})()')
    print(f'每帧 update（不含渲染）≈ {ms:.1f} ms'); pg.close()

    # ---------- 10. 假桥接 WebSocket ----------
    br = subprocess.Popen([python_cmd(), BRIDGE, '--fake'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    time.sleep(1.5)
    pg = new_page(b, 'nostore=1&hud=1'); pg.wait_for_timeout(3000)
    a1 = ev(pg, '__popup.S.target'); pg.wait_for_timeout(1200); a2 = ev(pg, '__popup.S.target')
    check('WebSocket 桥接：角度在动', ev(pg, "document.getElementById('dot').classList.contains('on')") and a1 != a2, f'{a1:.1f}→{a2:.1f}')
    shot(pg, 'ws_bridge'); pg.close(); br.terminate()
    b.close()

check('全程无 JS 异常 / console error', not errs, '; '.join(errs[:3]))
bad = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(bad)}/{len(results)} 通过' + (f'；失败：{bad}' if bad else ''))
sys.exit(1 if bad else 0)
