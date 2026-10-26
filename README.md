# 林间小屋 · 立体开合的书（MacBook 合页角度驱动）

合上笔记本盖子 = 合上这本书；慢慢打开屏幕，一本纸艺立体书就在屏幕里展开：松林、小木屋、亮灯的窗、一只橘猫，最后是月亮、星星和萤火虫。
网页只关心一个输入：**合页角度 `angle`（0–130°）**。没有传感器时用滑块也能完整体验。

## 一、文件

| 文件 | 说明 |
|---|---|
| `index.html` / `main.js` | 单页 Three.js 应用（无需构建；Three.js r160 已放在 `vendor/`，**离线可用**） |
| `bridge.py` | 读取合页角度，通过 WebSocket 广播 `{"angle": 87.3}`（30–60 Hz），带 `--fake` 假数据模式 |
| `requirements.txt` | Python 依赖：`websockets`、`pybooklid`（后者只有读真实传感器才需要） |
| `tests/` | 无头浏览器截图 / WebSocket 联调脚本（Playwright） |
| `shots/` | 各角度的截图 |

## 二、各角度发生什么

| 角度 | 画面 |
|---|---|
| 0–15° | 合着：封面标题《林间小屋》，缝里漏出一道暖光 |
| 15–40° | 地面折起，纸松树一排排立起来（后排的高树会被盖页顶着，约 60° 才完全站直，见"已知限制"） |
| 40–70° | 小木屋翻身立起，窗户亮灯，烟囱冒烟 |
| 70–100° | 小猫从门口探头（约 76°），再蹦到窗台上坐好，尾巴轻摆 |
| 100–130° | 天色变暗，月亮升起，星星、萤火虫出现 |
| **约 90°** | 彩蛋：小猫睁大眼睛，头顶冒出一颗小爱心 |
| 反向合上 | 小猫打个哈欠，低头睡着（Zzz）；再合就缩回门里，最后合成封面 |

手感细节：快速开合时每个部件各自带弹簧过冲/阻尼；静止时有轻微"呼吸"（烟、云、树叶、猫的呼吸和尾巴）。

## 三、在 macOS 上运行

### 1. 先只用滑块看看（不需要任何依赖）

```bash
cd popup-book
python3 -m http.server 8000
```

浏览器打开 <http://localhost:8000>，拖动底部滑块即可。
**不要直接双击 `index.html`（file:// 打开）**，ES module 会被浏览器拦截，页面是黑的。

快捷键：`H` 显示/隐藏调试面板，`←` / `→` 每次 ±2°。
URL 参数：`?hud=0` 隐藏面板；`?ws=ws://127.0.0.1:9000` 改 WebSocket 地址。
面板里的"自动演示"按钮会自己来回扫角度。

### 2. 接上真实的合页角度

新开一个终端：

```bash
cd popup-book
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
brew install hidapi          # pybooklid 依赖 hidapi（没有 Homebrew 的话先装 Homebrew）
python3 bridge.py            # 读取真实传感器
```

看到 `WebSocket 监听 ws://localhost:8765` 后刷新网页：面板左下的小圆点变绿，文字变成"传感器已连接"，滑块被禁用，书跟着你的屏幕开合。
桥断开 1.5 秒后网页自动退回滑块模式，桥重启后会自动重连（每 2 秒重试）。

### 3. 先用假数据确认链路

```bash
python3 bridge.py --fake     # 广播 0→130→0 的来回扫动（约 28 秒一个来回）
```

### bridge.py 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--fake` | 关 | 不读传感器，广播假角度 |
| `--hz` | 45 | 广播频率（建议 30–60） |
| `--offset` | 0 | 角度偏移（校准用，度） |
| `--smooth` | 0 | 低通平滑 0–0.95，数值越大越稳越慢 |
| `--clamp` | 180 | 角度上限（网页自己会再限制到 130） |
| `--host` / `--port` | localhost / 8765 | 监听地址 |

## 四、排查问题

**面板圆点一直是灰的**
- 先确认 `bridge.py` 在运行且没报错；端口被占用就换 `--port 9000`，网页用 `?ws=ws://localhost:9000`。
- 先用 `--fake` 排除传感器问题；如果 `--fake` 能通，问题就在传感器读取。

**报 "找不到传感器 / LidSensorError"，或 `bridge.py` 退出码 2**
1. `brew install hidapi`，然后重开终端。
2. 权限问题可以试 `sudo python3 bridge.py`（pybooklid 的 README 也这么建议；用 venv 的话写 `sudo .venv/bin/python bridge.py`）。
3. 关掉其他占用该传感器的程序（例如同时开着的 LidAngleSensor 之类的小工具）。
4. 这个传感器是苹果的私有 HID 设备，只在较新的 MacBook 上有；你的 2021 M1 Max 按你的实验是可读的，但不同系统版本可能有变化。

**角度范围不对（合上不是 0°、全开超过 130°）**
- 用 `--offset` 校准，例如合上时读到 3°：`python3 bridge.py --offset -3`。网页会把超过 130° 的值截断到 130°。

**画面抖**
- 传感器有噪声：`python3 bridge.py --smooth 0.5`。

**网页黑屏 / 卡顿**
- 必须用 `http://localhost:…` 打开，不能 file://。
- 卡的话把 `main.js` 里阴影贴图尺寸（搜索 `4096`）改成 `2048`，或把浏览器窗口缩小。

**中文字体**
- 标题用的是系统的宋体/苹方衬线回退；Mac 上正常，缺字体的系统会回退到默认字体。

## 五、传感器读不了怎么办

1. **滑块模式**本身就是完整体验（上面的"先只用滑块看看"）。
2. 用 `?ws=` 接别的输入：任何程序只要在 WebSocket 上广播 `{"angle": 0~130}` 就行，例如用触控板两指滑动、MIDI 旋钮、手机陀螺仪等做一个自己的小桥。
3. 先用开源的 LidAngleSensor（Swift 原生小工具）确认你的机器在这个系统版本上确实读得到角度，再回来查 `bridge.py`。
4. 看 pybooklid 的 issue / README：<https://github.com/tcsenpai/pybooklid>。

## 六、诚实说明（已验证 / 未验证）

- 已在无头 Chrome（SwiftShader 软件渲染）里验证：各角度渲染、弹簧动画、小猫状态机（探头→跳窗台→彩蛋→哈欠→睡觉）、WebSocket 自动检测与断线回退（用 `bridge.py --fake` 在 Linux 上联调）。
- **`bridge.py` 读真实传感器的那部分没有在真实 Mac 上测试过**。pybooklid 的 API（`LidSensor()` / `read_angle()` / `disconnect()`）是读了 1.0.0 版源码确认的，但不保证在你的机器上一次跑通；原始值范围、是否需要 sudo 都要你实测。
- 灯光、相机是在软件渲染下调的，真 GPU 上（M1 Max）亮度可能略有差异，可以调 `main.js` 里的灯光强度。

## 七、重新生成截图（可选，需要 Playwright）

```bash
pip install playwright websockets
# 服务器先在 8123 端口跑起来：python3 -m http.server 8123
python3 tests/shot.py "0,30,60,90,120"     # 截图写到 shots/
```
（脚本里用的是系统 Chrome：`/usr/bin/google-chrome`，在 Mac 上请把路径改成你的 Chrome，或用 `playwright install chromium` 后去掉 `executable_path`。）
