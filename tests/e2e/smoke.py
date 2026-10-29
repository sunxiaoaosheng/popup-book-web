"""一条端到端冒烟：假桥带动书，并覆盖换季、清晨、8 个秘密里的关键几条、一整天。

静态页要已经在 POPUP_BASE。本脚本自己拉起假桥（POPUP_WS / POPUP_HTTP）。
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from paths import BASE, BRIDGE, python_cmd, shot_dir  # noqa: E402

WS_PORT = int(os.environ.get("POPUP_WS", "18665"))
HTTP_PORT = int(os.environ.get("POPUP_HTTP", "18666"))
OUT = shot_dir("e2e")
CHROME = os.environ.get("CHROME")
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"]
QUIET = f"{BASE}?nostore=1&hud=0&ws=ws://127.0.0.1:9"
results = []


def check(name, ok, info=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info else ""))


def main():
    br = subprocess.Popen(
        [python_cmd(), BRIDGE, "--fake", "--host", "127.0.0.1", "--port", str(WS_PORT), "--http-port", str(HTTP_PORT)],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    errs = []
    try:
        health = None
        for _ in range(40):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{HTTP_PORT}/health", timeout=0.5) as res:
                    health = json.loads(res.read().decode())
                break
            except Exception:
                time.sleep(0.1)
        check("桥 /health", health and health.get("ok") and health.get("mode") == "fake" and health.get("v") == 1, str(health))

        with sync_playwright() as p:
            launch = {"args": ARGS}
            if CHROME:
                launch["executable_path"] = CHROME
            b = p.chromium.launch(**launch)
            pg = b.new_page(viewport={"width": 1280, "height": 800})
            pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
            pg.goto(f"{BASE}?nostore=1&hud=1&ws=ws://127.0.0.1:{WS_PORT}")
            pg.wait_for_function("window.__popup", timeout=30000)
            check("页面加载", True)
            check("手账一共 8 条", pg.inner_text("#jbtn").endswith("/8"), pg.inner_text("#jbtn"))
            pg.wait_for_timeout(1500)
            a1 = pg.evaluate("__popup.S.target")
            pg.wait_for_timeout(800)
            a2 = pg.evaluate("__popup.S.target")
            live = pg.evaluate("__popup.dbg().net.link")
            text = pg.inner_text("#srcText")
            btn = pg.inner_text("#auto")
            check("假桥 v1 带动角度且自动演示开着", live == "live" and a1 != a2 and "停止演示" in btn and "自动演示" in text, f"{a1:.1f}→{a2:.1f} {live} {btn} {text}")
            pg.click("#auto")
            pg.wait_for_timeout(300)
            held = pg.evaluate("__popup.S.target")
            pg.wait_for_timeout(600)
            held2 = pg.evaluate("__popup.S.target")
            manual = pg.evaluate("() => !document.getElementById('slider').disabled && document.getElementById('auto').textContent.includes('自动演示') && !document.getElementById('auto').textContent.includes('停止')")
            check("关掉自动演示后滑块接管", manual and abs(held2 - held) < 1.0, f"{held:.1f}→{held2:.1f} {pg.inner_text('#auto')} {pg.inner_text('#srcText')}")
            pg.click("#auto")
            pg.wait_for_timeout(200)
            back = pg.inner_text("#auto")
            disabled = pg.evaluate("() => document.getElementById('slider').disabled")
            check("再打开自动演示", "停止演示" in back and disabled, back)
            pg.close()

            q = b.new_page(viewport={"width": 1280, "height": 800})
            q.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
            q.goto(QUIET)
            q.wait_for_function("window.__popup", timeout=30000)
            q.evaluate("__popup.sweep(0,120,3); __popup.settle(0.4); __popup.sweep(120,0,3); __popup.settle(0.6)")
            q.evaluate("__popup.setAngle(18); __popup.settle(1.2); __popup.setAngle(40); __popup.settle(1.5)")
            d = q.evaluate("__popup.dbg()")
            check(
                "开着时换季",
                d.get("seasonMorphing") and 0.2 < d.get("seasonT", 0) < 0.7 and "换季了" in (d.get("caption") or ""),
                f"t={d.get('seasonT')} cap={d.get('caption')}",
            )
            q.evaluate("__popup.setAngle(45); __popup.settle(0.3)")
            pose = q.evaluate("() => { let best = 0; for (let i = 0; i < 90; i++) { __popup.settle(1/30); best = Math.max(best, __popup.dbg().dawnPose); } return best; }")
            check("清晨伸懒腰", pose > 0.8 and q.evaluate("__popup.dbg().dawnStretch") > 0.8, f"pose={pose}")

            track = q.evaluate("""() => {
              __popup.setAngle(105);
              __popup.settle(2);
              const before = __popup.dbg().track;
              __popup.setWeight(0.5);
              __popup.settle(0.9);
              const mid = __popup.dbg();
              __popup.settle(1.4);
              const on = __popup.dbg().track;
              __popup.setWeight(0);
              __popup.settle(1.6);
              const off = __popup.dbg().track;
              return {
                before, mid: mid.track, mood: mid.moodCap || '', on, off,
                hinge: !!mid.hinge, scale: !!document.querySelector('#scale, #weight, .scale'),
              };
            }""")
            check(
                "窗台礼物闻一下再收回",
                track["before"]["phase"] == "idle"
                and track["mid"]["phase"] == "sniff"
                and "闻了闻" in track["mood"]
                and track["on"]["phase"] == "held"
                and track["on"]["gift"] > 0.5
                and track["on"]["sniff"] < 0.05
                and track["off"]["phase"] == "idle"
                and track["off"]["gift"] < 0.15
                and track["hinge"]
                and not track["scale"],
                str(track),
            )

            q.evaluate("__popup.setAngle(8); __popup.settle(4.5)")
            q.evaluate("__popup.setAngle(90); __popup.settle(1.2)")
            check("缝里的眼睛", q.evaluate("__popup.store.hasSecret('seam')") is True)
            check("心动的直角", q.evaluate("__popup.store.hasSecret('heart')") is True)

            q.evaluate("__popup.setAngle(0); __popup.settle(0.4); __popup.sweep(0,128,14); __popup.settle(0.4)")
            d = q.evaluate("__popup.dbg()")
            check("一整天猫座", q.evaluate("__popup.store.hasSecret('fullday')") is True and "多了一只猫" in (d.get("caption") or ""), d.get("caption"))

            q.evaluate("__popup.setAngle(100); __popup.settle(1); __popup.sweep(100,0,8); __popup.settle(0.8)")
            d = q.evaluate("__popup.dbg()")
            check("轻轻合上是晚安", d.get("ending") == "gentle" and q.evaluate("__popup.store.hasSecret('goodnight')"), d.get("ending"))
            check("手账分母仍是 8", q.inner_text("#jbtn").endswith("/8"), q.inner_text("#jbtn"))

            ms = q.evaluate("() => { const t0 = performance.now(); for (let i = 0; i < 120; i++) { __popup.setAngle(20 + (i * 17) % 90); __popup.settle(1/60); } return (performance.now() - t0) / 120; }")
            check("快速甩角度", ms < 40 and not errs, f"{ms:.2f} ms/帧")
            try:
                q.screenshot(path=os.path.join(OUT, "after.png"), timeout=15000)
            except Exception as e:
                print("截图跳过:", e)
            q.close()

            br.terminate()
            br.wait(timeout=3)
            gone = b.new_page(viewport={"width": 800, "height": 600})
            gone.goto(f"{BASE}?nostore=1&hud=1&ws=ws://127.0.0.1:{WS_PORT}")
            gone.wait_for_function("window.__popup", timeout=30000)
            gone.wait_for_timeout(2500)
            check("桥断开后回到滑块", "模拟模式" in gone.inner_text("#srcText"), gone.inner_text("#srcText"))
            gone.close()

            dead = b.new_page(viewport={"width": 800, "height": 600})
            dead.goto(QUIET)
            dead.wait_for_function("window.__popup", timeout=30000)
            dead.wait_for_timeout(8500)
            connects = dead.evaluate("__popup.dbg().net.connects")
            check("断桥重连有上界", connects <= 8, f"connects={connects}")
            dead.close()
            b.close()
    finally:
        if br.poll() is None:
            br.terminate()
            try:
                br.wait(timeout=3)
            except subprocess.TimeoutExpired:
                br.kill()

    check("没有页面异常", not errs, "; ".join(errs[:3]))
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} 通过" + (f"；失败：{bad}" if bad else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
