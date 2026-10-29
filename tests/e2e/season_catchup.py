"""锁屏解开后的换季补播。

可见性事件先于 tick 到来时，不能用过期的盖子角度把这次边沿用掉。
纸页要跟着扫场张开，不能先弹到终点。
"""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from paths import BASE  # noqa: E402

CHROME = os.environ.get("CHROME")
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"]
QUIET = f"{BASE}?nostore=1&hud=0&ws=ws://127.0.0.1:9"
results = []

INIT = """
(() => {
  let hidden = false;
  const proto = Document.prototype;
  const define = (key, get) => {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (desc && desc.configurable === false) throw new Error(key + ' is not configurable');
    Object.defineProperty(proto, key, { configurable: true, get });
  };
  define('hidden', () => hidden);
  define('visibilityState', () => (hidden ? 'hidden' : 'visible'));
  window.__setPageHidden = (value) => {
    hidden = !!value;
    document.dispatchEvent(new Event('visibilitychange'));
    if (!hidden) window.dispatchEvent(new Event('focus'));
  };
})();
"""

STORY = """
() => {
  const pop = window.__popup;
  pop.holdSensor(true);
  pop.sweep(0, 100, 0.5);
  pop.settle(0.2);
  let n = 1;
  const packet = (angle) => JSON.stringify({ v: 1, type: 'angle', seq: n++, angle, t: n * 10, mode: 'sensor' });

  window.__setPageHidden(true);
  pop.frame(0.05);
  pop.pushRaw(packet(4));
  pop.frame(0.05);
  const closed = pop.dbg();

  window.__setPageHidden(false);
  const afterEvent = {
    target: pop.S.target,
    revealOpen: !!pop.S.revealOpen,
    pageHidden: !!pop.S.pageHidden,
    t: pop.dbg().seasonT,
  };
  pop.pushRaw(packet(96));
  const queuedTarget = pop.S.target;
  pop.frame(0.05);
  const opened = pop.dbg();
  const openedTarget = pop.S.target;

  const ts = [opened.seasonT];
  const pose = [opened.A];
  for (let i = 0; i < 8; i++) {
    pop.frame(1 / 30);
    ts.push(pop.dbg().seasonT);
    pose.push(pop.dbg().A);
  }
  const midT = pop.dbg().seasonT;
  const midPose = pop.dbg().A;
  pop.pushRaw(packet(3));
  pop.frame(0.05);
  const shut = pop.dbg();

  pop.sweep(0, 100, 0.4);
  pop.settle(0.2);
  window.__setPageHidden(true);
  pop.frame(0.05);
  pop.pushRaw(packet(3));
  pop.frame(0.05);
  const beforeSecond = pop.sound.events.filter((name) => String(name).startsWith('motif-')).length;
  window.__setPageHidden(false);
  pop.pushRaw(packet(100));
  pop.frame(0.05);
  const again = [];
  for (let i = 0; i < 80; i++) {
    pop.frame(1 / 30);
    again.push(pop.dbg().seasonT);
  }
  const motifs = pop.sound.events.filter((name) => String(name).startsWith('motif-')).length;
  return {
    beforeSecond,
    closedT: closed.seasonT,
    closedFrom: closed.seasonFrom,
    closedTo: closed.seasonTo,
    afterEvent,
    queuedTarget,
    openedT: opened.seasonT,
    openedPose: opened.A,
    openedTarget,
    openedCatch: opened.seasonCatchup,
    ts,
    pose,
    midT,
    midPose,
    shutT: shut.seasonT,
    shutCatch: shut.seasonCatchup,
    shutPose: shut.A,
    again,
    motifs,
    caption: pop.S.cap || '',
  };
}
"""


def check(name, ok, info=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info else ""))


def main():
    errs = []
    with sync_playwright() as p:
        launch = {"args": ARGS}
        if CHROME:
            launch["executable_path"] = CHROME
        browser = p.chromium.launch(**launch)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.add_init_script(INIT)
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(QUIET, wait_until="domcontentloaded")
        page.wait_for_function("() => !!(window.__popup && window.__setPageHidden)", timeout=30000)
        data = page.evaluate(STORY)
        browser.close()

    check("没有页面异常", not errs, "; ".join(errs[:3]))
    check(
        "隐藏时合严记上待播",
        data["closedT"] == 0 and data["closedFrom"] != data["closedTo"],
        f"t={data['closedT']} {data['closedFrom']}→{data['closedTo']}",
    )
    check(
        "可见性事件不拿过期角度做决定",
        data["afterEvent"]["pageHidden"] and not data["afterEvent"]["revealOpen"] and data["afterEvent"]["target"] < 22,
        str(data["afterEvent"]),
    )
    check(
        "张开的角度要等 tick 才写上",
        data["queuedTarget"] < 22,
        f"target={data['queuedTarget']}",
    )
    check(
        "排空之后才开始补播",
        data["openedCatch"] and 0 < data["openedT"] < 0.2 and data["openedPose"] < 22 and data["openedTarget"] >= 90,
        f"t={data['openedT']} pose={data['openedPose']} target={data['openedTarget']}",
    )
    walked = [t for t in data["ts"] if 0.05 < t < 0.95]
    check("t 走过 (0,1)", len(walked) >= 3, f"samples={data['ts'][:6]}")
    check(
        "纸页跟着扫场张开，没有先弹开",
        data["pose"][0] < 22 and data["midPose"] > data["pose"][0] + 5 and data["midPose"] < 90,
        f"pose0={data['pose'][0]} mid={data['midPose']} t={data['midT']}",
    )
    check(
        "再合上就停掉补播",
        data["shutT"] == 0 and not data["shutCatch"] and data["shutPose"] < 40,
        f"t={data['shutT']} catch={data['shutCatch']} pose={data['shutPose']}",
    )
    full = [t for t in data["again"] if 0 < t < 1]
    check(
        "下一次解开仍补播完整一场，字幕只有这一次的一句",
        len(full) >= 5 and data["again"][-1] == 1 and data["motifs"] == data["beforeSecond"] + 1 and "换季了" in data["caption"],
        f"end={data['again'][-1]} motifs={data['beforeSecond']}→{data['motifs']} cap={data['caption']}",
    )

    bad = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} 通过" + (f"；失败：{bad}" if bad else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
