"""分享卡冒烟：无头 Chrome 里出 PNG，支持时再出一段 WebM。

静态页要已经在 POPUP_BASE。不启动桥，角度用滑块钩子。
"""
import base64
import io
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from paths import BASE, shot_dir  # noqa: E402

OUT = shot_dir("share")
CHROME = os.environ.get("CHROME")
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"]
PNG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
WEBM = bytes([0x1A, 0x45, 0xDF, 0xA3])
results = []


def check(name, ok, info=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info else ""))


def spread(im, photo):
    box = (
        int(photo["x"]) + 8,
        int(photo["y"]) + 8,
        int(photo["x"] + photo["w"]) - 8,
        int(photo["y"] + photo["h"]) - 8,
    )
    crop = im.crop(box).resize((48, 48)).convert("RGB")
    chans = list(zip(*crop.getdata()))
    return [max(c) - min(c) for c in chans]


def ink_hits(im, x, y, width):
    paper = im.getpixel((8, 8))
    y = max(0, min(im.height - 1, int(y)))
    hits = 0
    for px in range(int(x), min(im.width, int(x + width)), 2):
        p = im.getpixel((px, y))
        if abs(p[0] - paper[0]) + abs(p[1] - paper[1]) + abs(p[2] - paper[2]) > 36:
            hits += 1
    return hits


def save_card(b64, name):
    raw = base64.b64decode(b64)
    path = os.path.join(OUT, name)
    with open(path, "wb") as f:
        f.write(raw)
    return raw, Image.open(io.BytesIO(raw)).convert("RGB")


def main():
    errs = []
    with sync_playwright() as p:
        launch = {"args": ARGS}
        if CHROME:
            launch["executable_path"] = CHROME
        b = p.chromium.launch(**launch)
        pg = b.new_page(viewport={"width": 1280, "height": 800})
        pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        pg.goto(f"{BASE}?nostore=1&hud=1&shareclip=0&ws=ws://127.0.0.1:9")
        pg.wait_for_function("window.__popup", timeout=30000)
        pg.evaluate("__popup.forceSeason(2); __popup.setAngle(88); __popup.settle(1.6)")
        pg.screenshot(path=os.path.join(OUT, "ui-autumn.png"), timeout=15000)
        check("分享按钮", pg.inner_text("#share") == "分享", pg.inner_text("#share"))
        check("提示里有 C", "C 分享" in pg.inner_text("#hint"), pg.inner_text("#hint"))

        card = pg.evaluate(
            """() => window.__popup.shareCard({
              download: false, copy: false, clip: false, toast: false, embed: true
            })"""
        )
        raw, im = save_card(card["png"]["b64"], "card-autumn.png")
        check("返回一张卡", card.get("ok") is True and card.get("clip") == "png", str(card.get("reason") or card.get("clip")))
        check("秋 · 时段", card.get("label", "").startswith("秋"), card.get("label"))
        check("小秘密分母是 8", card.get("secrets", "").endswith("/8"), card.get("secrets"))
        check("书名印", card.get("mark") == "林间小屋", card.get("mark"))
        check("png 文件头", raw.startswith(PNG) and im.size == (card["width"], card["height"]), str(im.size))
        spreads = spread(im, card["photo"])
        check("照片不是空白", max(spreads) > 25, str(spreads))
        label_hits = ink_hits(im, card["labelPos"]["x"], card["labelPos"]["y"], 180)
        cap_hits = ink_hits(im, card["width"] / 2 - 160, card["captionPos"]["y"], 320)
        check("季节字画上去了", label_hits > 4, f"hits={label_hits} {card.get('label')}")
        check("小猫那句画上去了", cap_hits > 4, f"hits={cap_hits} {card.get('caption')}")

        with pg.expect_download(timeout=20000) as dl_info:
            pg.click("#share")
        dl = dl_info.value
        pg.wait_for_selector("#toast.show", timeout=5000)
        toast = pg.inner_text("#toast")
        body = open(dl.path(), "rb").read()
        check("按钮下载 png", (dl.suggested_filename or "").endswith(".png") and body.startswith(PNG), dl.suggested_filename)
        check("按钮提示", "分享卡" in toast, toast)
        pg.wait_for_function("document.querySelector('#share').textContent === '分享'", timeout=5000)

        with pg.expect_download(timeout=20000) as key_info:
            pg.keyboard.press("c")
        key_dl = key_info.value
        check("C 键也下载 png", (key_dl.suggested_filename or "").endswith(".png"), key_dl.suggested_filename)
        pg.wait_for_function("() => !window.__popup.shareBusy()", timeout=5000)
        pg.close()

        winter = b.new_page(viewport={"width": 1280, "height": 800})
        winter.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        winter.goto(f"{BASE}?nostore=1&hud=1&ws=ws://127.0.0.1:9")
        winter.wait_for_function("window.__popup", timeout=30000)
        winter.evaluate("__popup.forceSeason(3); __popup.setAngle(118); __popup.settle(1.6)")
        clip = winter.evaluate(
            """() => window.__popup.shareCard({
              download: false, copy: false, toast: false, embed: true, seconds: 1
            })"""
        )
        raw_w, im_w = save_card(clip["png"]["b64"], "card-winter.png")
        check("冬夜卡片", clip.get("ok") is True and clip.get("label", "").startswith("冬"), clip.get("label"))
        check("冬夜照片不是空白", max(spread(im_w, clip["photo"])) > 25 and raw_w.startswith(PNG), clip.get("caption"))
        webm = clip.get("webm") or {}
        head = bytes(webm.get("head") or [])
        if clip.get("clip") == "webm":
            check("短片是 webm", head.startswith(WEBM) and webm.get("size", 0) > 100, f"size={webm.get('size')} head={head[:4].hex()}")
        else:
            check("没有短片时仍有 png", clip.get("clip") == "png" and raw_w.startswith(PNG), clip.get("clip"))
        winter.close()
        b.close()

    check("没有页面异常", not errs, "; ".join(errs[:3]))
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} 通过" + (f"；失败：{bad}" if bad else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
