"""短冒烟：页面能开、8 个秘密、换季、清晨伸懒腰、假桥带动角度、快速甩角度不抛错、断桥重连不爆炸。

    POPUP_BASE=http://127.0.0.1:8099/index.html POPUP_WS=8799 python3 tests/smoke.py

静态页要已经在 POPUP_BASE 上。假桥由本脚本自己拉起（端口 POPUP_WS，默认 8765）。
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

from paths import BASE, BRIDGE, python_cmd, shot_dir

WS_PORT = int(os.environ.get("POPUP_WS", "8765"))
OUT = shot_dir("smoke")
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"]
results = []


def check(name, ok, info=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info else ""))


def main():
    br = subprocess.Popen(
        [python_cmd(), BRIDGE, "--fake", "--host", "127.0.0.1", "--port", str(WS_PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    time.sleep(0.8)
    errs = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=ARGS)
            pg = b.new_page(viewport={"width": 1280, "height": 800})
            pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
            pg.on(
                "console",
                lambda m: errs.append("CONSOLE " + m.text)
                if m.type == "error" and "WebSocket" not in m.text and "ERR_CONNECTION" not in m.text
                else None,
            )
            pg.goto(f"{BASE}?nostore=1&hud=1&ws=ws://127.0.0.1:{WS_PORT}")
            pg.wait_for_function("window.__popup", timeout=30000)
            check("页面加载 __popup", True)
            check("手账 8 个秘密", "0/8" in pg.inner_text("#jbtn"), pg.inner_text("#jbtn"))

            pg.wait_for_timeout(1200)
            a1 = pg.evaluate("__popup.S.target")
            pg.wait_for_timeout(900)
            a2 = pg.evaluate("__popup.S.target")
            dot = pg.evaluate("document.getElementById('dot').classList.contains('on')")
            check("假桥带动角度且圆点变绿", dot and a1 != a2, f"{a1:.1f}→{a2:.1f} dot={dot}")
            pg.close()

            # 玩法断言不能跟假桥抢角度，否则 setAngle 会被下一帧广播盖掉。
            quiet = b.new_page(viewport={"width": 1280, "height": 800})
            quiet.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
            quiet.goto(f"{BASE}?nostore=1&hud=0&ws=ws://127.0.0.1:9")
            quiet.wait_for_function("window.__popup", timeout=30000)

            quiet.evaluate("__popup.setAngle(0); __popup.settle(0.2)")
            quiet.evaluate("__popup.sweep(0,120,3); __popup.settle(0.4); __popup.sweep(120,0,3); __popup.settle(0.6)")
            quiet.evaluate("__popup.setAngle(18); __popup.settle(2)")
            quiet.evaluate("__popup.setAngle(40); __popup.settle(2)")
            d = quiet.evaluate("__popup.dbg()")
            check(
                "换季过渡可见",
                d.get("seasonMorphing") and 0.2 < d.get("seasonT", 0) < 0.7 and "换季了" in (d.get("caption") or ""),
                f"t={d.get('seasonT')} cap={d.get('caption')} A={d.get('angle')}",
            )
            try:
                quiet.screenshot(path=os.path.join(OUT, "morph.png"), timeout=15000)
            except Exception as e:
                print("截图跳过:", e)

            quiet.evaluate("__popup.setAngle(45); __popup.settle(0.4)")
            best = quiet.evaluate(
                """() => {
                  let best = 0;
                  for (let i = 0; i < 90; i++) { __popup.settle(1/30); best = Math.max(best, __popup.dbg().dawnPose); }
                  return best;
                }"""
            )
            dawn_w = quiet.evaluate("__popup.dbg().dawnStretch")
            check("清晨伸懒腰", best > 0.8 and dawn_w > 0.8, f"pose={best} dawnW={dawn_w}")

            ms = quiet.evaluate(
                """() => {
                  const t0 = performance.now();
                  for (let i = 0; i < 180; i++) {
                    __popup.setAngle(20 + (i * 17) % 100);
                    __popup.settle(1/60);
                  }
                  return (performance.now() - t0) / 180;
                }"""
            )
            check("快速甩角度没有拖死", ms < 40 and not any(x.startswith('PAGEERROR') for x in errs), f"{ms:.2f} ms/帧")
            quiet.close()

            # 桥不在时，重连必须是单飞的，不能指数增长
            dead = b.new_page(viewport={"width": 800, "height": 600})
            dead.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
            dead.goto(f"{BASE}?nostore=1&hud=0&ws=ws://127.0.0.1:9")
            dead.wait_for_function("window.__popup", timeout=30000)
            dead.wait_for_timeout(8500)
            connects = dead.evaluate("__popup.dbg().net.connects")
            check("断桥重连次数有界", connects <= 8, f"connects={connects}")
            dead.close()
            b.close()
    finally:
        br.terminate()
        try:
            br.wait(timeout=3)
        except subprocess.TimeoutExpired:
            br.kill()

    check("全程无 JS 异常", not errs, "; ".join(errs[:3]))
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} 通过" + (f"；失败：{bad}" if bad else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
