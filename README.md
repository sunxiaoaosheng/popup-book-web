# 林间小屋 · 立体开合的书（MacBook 合页角度驱动）

合上笔记本盖子 = 合上这本书；慢慢打开屏幕，一本纸艺立体书就在屏幕里展开：松林、小木屋、亮灯的窗、一只橘猫，最后是月亮、星星和萤火虫。
网页只关心一个输入：**合页角度 `angle`（0–130°）**。没有传感器时用滑块也能完整体验。

## 先跑起来

```bash
./start.sh
./start.sh stop
```

`./start.sh` 转到后台，终端马上空出来。地址打在终端上，也写进 `logs/popup-book.log`。停掉用 `./start.sh stop`。没有 Docker 就加 `--no-docker`。检查用 `./start.sh test`。细节在下一节和第三节。

卡顿写在 `PERFORMANCE.md`。角度帧写在 `docs/PROTOCOL.md`。模块怎么分写在 `docs/ARCHITECTURE.md`。

**现在是 v9，穿模和后台启动在标签 `fixed-v10`。** 玩法仍是那本会回应你的书：开得快慢、停多久、晃不晃、怎么合上，它都有不同的反应；四季随着每次开合轮换；还藏了 8 个小秘密（v4 新增 1 个）等你自己发现（提示在游戏里的"📖 小秘密"手账中，**答案放在文末"剧透"章节，想自己玩的话别往下翻**）。v8 把判定收成状态机，把角度来源收成适配器。手感数字仍在 `frontend/js/tuning.js`。春、冬各多了一句季节反应，不进手账。v9 加上 Homebrew formula 和未签名的打包脚本，仍然不签名、不上架。

## 一、文件

静态页和角度桥分开。网页不读传感器，桥不画场景。

| 路径 | 说明 |
|---|---|
| `frontend/` | 静态页。`index.html`、`styles.css`、`js/`（ES modules，不用打包） |
| `frontend/vendor/three.module.js` | Three.js r160，随仓库走，**离线可用** |
| `frontend/js/story.js` | 数据：小秘密的名字/提示、四季设定与晚安台词 |
| `frontend/js/tuning.js` | 手感阈值（`TUNING`）。改判定先改这里 |
| `frontend/js/rules.js` | 纯判定：换季进度、时段、停住带、一整天、合盖快慢。不引用 Three |
| `frontend/js/play-machine.js` `kitten-machine.js` `season-machine.js` `season-beats.js` | 状态机。结果经 `bus.js` 交给声音和字幕 |
| `frontend/js/protocol.js` | 角度流解析、序号门、连接状态（过期 / 断开） |
| `frontend/js/audio.js` | WebAudio 纯合成音效（没有任何音频文件） |
| `frontend/js/hinge-feel.js` `hinge-audio.js` `sim-feel.js` | 合页动手感：角速度映射成嘎吱、纸声、轻撞和镜头微晃。强度记在存档 `feel` |
| `frontend/js/store.js` | `localStorage` 适配。存档逻辑在 `store-core.js` |
| `frontend/js/ui.js` | DOM：音效按钮、手账、提示气泡、"别动"进度环、晚安结尾 |
| `frontend/js/gfx.js` `build-*.js` `sim-*.js` `input.js` `season.js` | 场景、昼夜、小猫、输入、帧循环。入口是 `js/main.js` |
| `backend/bridge.py` | 选择适配器。`--fake` / `--replay` / 真实合页 |
| `backend/broadcast.py` `backend/health.py` | 协议 v1 广播和 `GET /health` |
| `backend/sensors/` | 角度适配器。契约在 `docs/ADAPTERS.md` |
| `backend/protocol.py` | 角度帧、心跳、`/health` 的字段 |
| `backend/requirements.txt` | 假桥只要 `websockets` |
| `backend/requirements-sensor.txt` | 真实传感器再加 `pybooklid` |
| `start.sh` | 后台拉起静态页和桥。`./start.sh stop` 停，`./start.sh test` 跑检查 |
| `logs/popup-book.log` | 后台日志（gitignore） |
| `logs/popup-book.pid` | 后台进程号，`stop` 读这个文件 |
| `packaging/popup-book` | 和 `./start.sh` 同一条命令，给 Homebrew 用 |
| `packaging/homebrew/` | formula（源码安装）。cask 只是示例 |
| `packaging/mac/` | 未签名的 `.app` / `.dmg` 脚本。Linux 上跳过映像 |
| `docs/PROTOCOL.md` | 前后端角度流契约 |
| `docs/RELEASE.md` | 附注标签 `v*` 怎么打出 GitHub Release |
| `docs/ARCHITECTURE.md` | 模块图 |
| `docs/ADAPTERS.md` | 角度适配器契约 |
| `docker/` | 静态页和假桥的镜像。真实合页不进容器 |
| `PERFORMANCE.md` | 假死和掉帧的原因，以及改了什么 |
| `tests/unit/` | 协议、玩法判定、存档、桥的健康检查 |
| `tests/e2e/smoke.py` | 一条无头浏览器冒烟：假桥、换季、清晨、秘密、一整天 |
| `shots/` | 截图（gitignore，跑测试时生成） |
| `CHANGELOG.md` | 版本记录 |

## 二、各角度发生什么

| 角度 | 画面 |
|---|---|
| 0–15° | 合着：封面标题《林间小屋》，缝里漏出一道暖光 |
| 15–35° | 地面折起，纸松树一排排立起来（v2 把后排的树改矮并前移，约 30° 就全部站直） |
| 34–70° | 小木屋先平躺着滑过来，约 52° 立起；立起之前屋顶/烟囱/门窗这些立体件是收起的，所以不再糊成一团。窗户亮灯，烟囱冒烟。**v5**：约 36–58° 小猫在亮窗后伸懒腰（抬爪、弓背、打哈欠）；停住约 2 秒有一句字幕 |
| 36–112° | **v3 日晷**：开盖的过程就是一天。纸太阳从右边沿着天上的虚线槽升起（清晨，粉色晨光），约 74° 到正午头顶，再往左落下（黄昏，橙色霞光）；树和小屋的影子跟着从一边扫到另一边。屏幕下方的字幕前面会带上「清晨 / 上午 / 正午 / 午后 / 黄昏 / 夜」 |
| 70–100° | 小猫从门口探头（约 76°），再蹦到窗台上坐好，尾巴轻摆 |
| 100–130° | 太阳在左边落下的同时，月亮从右边升起；天色变暗，星星、萤火虫出现 |
| **约 90°** | 彩蛋：小猫睁大眼睛，头顶冒出一颗小爱心 |
| 反向合上 | 小猫打个哈欠，低头睡着（Zzz）；再合就缩回门里，最后合成封面 |
| 每次合上 | 季节 +1：春 → 夏 → 秋 → 冬 → 春……封面上会写"第 N 次翻开 · 季节"和已发现的小秘密数。**v6**：合着时先不把画面切完；下次打开约 22–65° 能看见换季过渡 |

手感细节：快速开合时每个部件各自带弹簧过冲/阻尼；静止时有轻微"呼吸"（烟、云、树叶、猫的呼吸和尾巴）。

## 二·五、v2 新玩法（不剧透版）

- **手感会变**：慢慢打开，小猫会害羞地探头；猛地打开，纸张会哗啦啦抖，林子里的邻居也会被吓到；开着的时候快速晃一晃，树上的东西会抖落下来；合上的快慢决定书怎么说晚安。
- **停下来也有戏**：在某些角度停住不动，书会觉得你在等它，然后发生点什么。
- **四季轮换**：每完整地开合一次，换一个季节，配色、飘落物、小猫的行头和窗台上的小道具都不一样（春花瓣和蝴蝶、夏草帽+西瓜、秋落叶+南瓜灯、冬雪+围巾+热可可）。**v6** 起，换季发生在下一次打开的过程里，能看见过渡。
- **7 个小秘密**：左上"📖 小秘密 N/7"手账里有含蓄的提示，发现后会记下来（存在浏览器 `localStorage`，刷新不丢）。每隔一阵子没新发现，屏幕下方会飘出一句提示。
- **声音**（全部现场合成）：沙沙声跟着角速度走、森林环境音（鸟鸣/虫鸣随季节和昼夜变）、小猫的喵和呼噜、猫头鹰、风铃。**出于浏览器规定，要先点一下页面（或按左上角 🔊）才会出声**；`M` 键或按钮可静音，静音状态会记住。
- **鼠标/触控板（可选）**：小猫会用眼睛追着你的鼠标看；点小猫它会喵，**按住不放可以摸摸它**（呼噜+爱心）；点猫头鹰、点树也有反应。

快捷键新增：`M` 静音、`J` 手账、`Esc` 关手账。URL 参数新增：`?season=0..3` 指定季节、`?reset=1` 清空存档、`?nostore=1` 本次不读写存档。

## 二·六、v3 新玩法：日晷（不剧透版）

- 盖子的角度 = 一天中的时刻。慢慢打开，就像看着纸太阳在书页上走完一天：晨光是粉的，正午影子最短，黄昏时天边烧成橙色，然后太阳沉下去、月亮接班。
- 太阳也是纸做的，带一点弹簧：猛地开盖时它会冲过头一点再荡回来。它闭着眼睛笑，快落山时会眯起来。
- 四个季节下都有太阳，配色跟着季节走。

## 二·七、v4 新玩法：小猫的一天（不剧透版）

- 小猫开始"过日子"了：正午太阳太晃眼，它会眯着眼探头，隔一会儿打个小喷嚏；黄昏它会转过头去看太阳落山；夜里抬头看月亮。（你在晃鼠标的时候，它还是先看你。）
- 小秘密手账多了第 8 条，提示是：「从天亮到天黑，慢慢来。别回头，也别着急。」找到之后，书里会永久多出一样东西，以后每个夜晚都能看到。
- 为了给"看日落"留出时间，"追萤火虫"那个停住彩蛋改成了更晚一点、天真正黑下来之后才触发。
- 手感参数在 `frontend/js/tuning.js` 的 `TUNING` 里（`daySeconds`、`dayBackTol`、`sneezeEvery` 等），真机上觉得太难或太容易可以直接改。

## 二·八、v5 新玩法：清晨窗后伸懒腰（不剧透版）

- 天亮最早的那一段，小猫还没出门——它在**亮着的窗户后面**伸懒腰：前爪抬起来、背弓一下、眯着眼打个哈欠。盖子开到门口探头之后，它才换成你熟悉的门边/窗台动作。
- 在清晨那一段角度停住不动大约两秒，会看到一句「清晨 · 窗边伸了个懒腰」（每打开一次只说一遍）。这不是新的小秘密，手账还是 8 条。
- 正午打喷嚏、黄昏看日落、夜里看月亮都还在；参数在 `frontend/js/tuning.js` 的 `TUNING`（`dawnLo` / `dawnHi` / `dawnHold`）。

## 二·九、v6 新玩法：开着时换季（不剧透版）

- 完整地开合一次之后，季节还是会往前走——但**下次慢慢打开**时，你会看见树色、天空、窗台上的小道具和小猫的行头一起变过去（春的花瓣换成夏的西瓜，再往后是落叶、初雪）。
- 开得越慢，过渡看得越清楚；一下子开过那一段，也会一次变完。变的时候屏幕下方会说一句「春 → 夏 · 换季了」（每换一次说一遍）。这不是新的小秘密，手账还是 8 条。
- 清晨窗后伸懒腰、正午打喷嚏、黄昏看日落、夜里看月亮都还在。参数在 `frontend/js/tuning.js` 的 `TUNING`（`seasonMorphLo` / `seasonMorphHi`）。

## 二·十、v8：状态机，以及春冬的两句反应（不剧透版）

- 小猫这一拍处于哪一种姿势、秘密什么时候算触发、换季进度走到哪，都由状态机决定，再经事件总线通知声音和字幕。手账仍是 8 条。
- 春天在窗台多停一会儿，会有一句关于蝴蝶的话。冬天第一次站到窗台上，会有一句关于围巾的话。都不是新的小秘密。
- 远山的小松和云改成了实例绘制。折叠的近景树仍是各自的弹簧，因为猫头鹰停在其中一棵上，点树也要点到那一棵。
- `P` 键打开性能面板（帧时间、draw call、像素比）。标签页隐藏时不画。
- 桥可以 `--replay trace.jsonl` 重放一段角度。见 `docs/ADAPTERS.md`。

## 二·十一、动手感（不剧透版）

- 盖子转得越快，铰链越嘎吱，纸页的沙沙也越满。经过直角、开到头、合严，各有一下很轻的撞击。慢到几乎不动时这些声音会歇下来。
- 镜头跟着速度有一点微晃、视差和视场呼吸，幅度有上限，并且是平滑的，不会晃得难受。左上角「手感」或 `K` 可以改成低、或关掉。选择会记住。
- `M` 静音仍然关掉全部声音，包括这层拟音。关掉手感只停掉这层声音和镜头偏移，森林和猫咪的声音还在。
- 数字在 `frontend/js/tuning.js` 的 `HINGE_FEEL`。真实合页和滑块走的是同一条曲线。

## 三、运行

### 怎么开、怎么停

在仓库根目录：

```bash
./start.sh
./start.sh stop
```

`./start.sh` 和 `./start.sh --sensor` 都转到**后台**，不占当前终端。就绪之后脚本退出，页面和桥继续跑。

- 日志：`logs/popup-book.log`（每次启动往下追加）
- 进程号：`logs/popup-book.pid`
- 停止：`./start.sh stop`。它读 pid 文件，发 TERM。脚本自己的清理会关掉这一次拉起的静态页和桥。pid 已经失效时，仍会再看 `.run/session.env` 里记下的子进程。
- 不要用笼统的 `pkill python` 或 `pkill -f http.server`，那会误伤别的程序。

后台启动不会问 `[y/n]`，缺的 Python 依赖会直接装。`.app` 里的启动器设了 `POPUP_FOREGROUND=1`，那个进程留在前台，方便系统把它当成正在运行的应用；另开终端仍可以用仓库里的 `./start.sh stop`（pid 写在包内的 `logs/`）。

默认是**假角度桥 + 静态页**。浏览器打开脚本打印的地址（默认 <http://127.0.0.1:19081/?ws=ws://127.0.0.1:19876>），一次即可，不用连刷。脚本会等静态页和桥都开始听（本机有 IPv6 时包括 `::1`）才打印这行。左下圆点变绿，按钮是「■ 停止演示」，书跟着 0→130→0 开合。再点一次按钮，扫角停住，滑块可以拖。`./start.sh --sensor` 不会打开这段演示，合页角度直接驱动书。

同一模式再执行一次：服务还健康的话只打印地址，不会占第二个端口。

```bash
./start.sh --help
./start.sh --slider --no-docker     # 只开网页，用底部滑块，不启动桥
./start.sh --fake --no-docker       # 假角度。默认就是这个，只是不走 Docker
./start.sh --sensor                 # 真实 MacBook 合页。仅 macOS，桥在宿主机
./start.sh --no-docker              # 本机 python，不建容器
./start.sh --docker                 # 必须用 Docker
./start.sh --restart                # 停掉上次的进程/容器再启动
./start.sh --port 8123 --ws-port 19876
./start.sh --sensor --smooth 0.5 --offset -3
./start.sh stop
./start.sh test --yes              # ESLint、tsc、单元测试、无头冒烟
```

前台交互（没转到后台时，例如 `.app`）缺依赖会先问 `[y/n]`：`backend/.venv` 和 pip、macOS 上的 `brew install hidapi`、第一次构建镜像时拉取 `python:3.12-alpine`。`--yes` 才跳过询问。后台启动等同于带了 `--yes`。

### 假传感器和滑块

- `./start.sh` 或 `./start.sh --fake`：不读硬件，桥广播 0→130→0 的假角度。没有 Mac 也能完整体验。
- `./start.sh --slider --no-docker`：不起桥。打开页面，拖底部滑块，或按 `←` / `→`。左下圆点是灰的，「模拟模式」。
- 页面上的「自动演示」会自己来回扫角度，不需要桥。

### 真机合页

只在 macOS 上。角度来自 MacBook 的 HID，Docker 里读不到，所以桥一定在宿主机。

```bash
brew install hidapi
./start.sh --sensor
```

这会装 `backend/requirements-sensor.txt`（`pybooklid`）并在后台启动。权限或「找不到传感器」见第四节。先用 `./start.sh --fake` 确认页面是好的，再查传感器。

### 依赖

| 要什么 | 什么时候 |
|---|---|
| `python3`、`curl` | 跑页面和桥 |
| `node`、`npm` | 只在 `./start.sh test`（ESLint、`tsc`） |
| Docker（可选） | 不写 `--no-docker` 且守护进程可用时，静态页和假桥进容器 |
| `hidapi`、`pybooklid` | 只在 `./start.sh --sensor` |

目录见第一节。`logs/`、`.run/`、`backend/.venv/` 都不进 git。

不想先克隆仓库、也还没有 Apple 开发者账号时，用 Homebrew formula（源码 + `python@3.12`，命令是 `popup-book`）：

```bash
brew install --HEAD --formula ./packaging/homebrew/Formula/popup-book.rb
popup-book --fake --no-docker --yes
```

说明在 `packaging/homebrew/README.md`。发版在 `docs/RELEASE.md`。未签名 `.app` 会被 Gatekeeper 拦住，右键「打开」或到「系统设置 → 隐私与安全性」里放行，见 `packaging/mac/README.md`。这条路不签名、不公证、不上 App Store。改代码时仍用 `./start.sh`。

Docker 可用时，静态页和假桥进容器（`docker/Dockerfile.web`、`docker/Dockerfile.bridge`）。真实合页是 Mac 的 HID，容器里读不到，所以 `--sensor` 的桥永远在宿主机跑 `backend/bridge.py`。没有 Docker 时自动改用本机 `python3 -m http.server`，目录是 `frontend/`。

**不要双击 `frontend/index.html`（file://）**。ES module 会被拦，页面是黑的。

快捷键：`H` 面板，`←` / `→` 每次 ±2°，`M` 静音，`K` 手感（常 / 低 / 关），`J` 手账，`Esc` 关手账。
URL：`?hud=0` 藏面板；`?ws=ws://127.0.0.1:9000` 改桥地址；`?season=0..3`；`?reset=1` 清空存档；`?nostore=1` 本次不读写；`?pdb=1` 保留绘图缓冲（截图用，平时更吃合成线程）。
面板里的「自动演示」会自己来回扫角度。

桥连上且角度在 1.5 秒内到达时，左下圆点是绿的。假角度桥这时按钮是「■ 停止演示」，滑块禁用；再点一次改为滑块。实机合页（`--sensor`）按钮保持「▶ 自动演示」，角度跟盖子走，滑块禁用。只有再点按钮才会暂时改成本地扫角，点「停止」后回到合页。角度停了但连接还在，圆点变黄，可以改用滑块。套接字断开则马上回到灰点和「模拟模式」，大约每 2 秒重连一次；握手卡住超过 1.5 秒会主动关掉再连，不会越连越多，也不必靠刷新。健康检查在 `http://127.0.0.1:<ws 端口+1>/health`（默认 19877）。

### 仍想手动启动

```bash
python3 backend/static_server.py --port 19081 --directory frontend --bind loopback
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/python backend/bridge.py --fake
curl -s http://127.0.0.1:19877/health
```

真实传感器改用 `backend/requirements-sensor.txt`，macOS 上先 `brew install hidapi`，然后去掉 `--fake`。

### bridge.py 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--fake` | 关 | 不读传感器，广播假角度 |
| `--hz` | 45 | 广播频率（建议 30–60） |
| `--offset` | 0 | 角度偏移（校准用，度） |
| `--smooth` | 0 | 低通平滑 0–0.95，数值越大越稳越慢 |
| `--clamp` | 180 | 角度上限（网页自己会再限制到 130） |
| `--host` / `--port` | localhost / 19876 | WebSocket 监听地址。`localhost`、`127.0.0.1`、`::1` 会同时绑 IPv4 和 IPv6 环回 |
| `--http-port` | 19877 | `GET /health`。`./start.sh` 默认用 ws 端口 + 1 |

## 四、排查问题

**面板圆点一直是灰的**
- 先确认 `./start.sh` 或 `backend/bridge.py` 在跑且没报错。端口被占用就 `./start.sh --ws-port 9000`，网页用 `?ws=ws://127.0.0.1:9000`。
- 先用 `./start.sh --fake` 排除传感器。假桥能通，问题就在传感器读取。

**报 "找不到传感器 / LidSensorError"，或桥退出码 2**
1. `brew install hidapi`，然后重开终端。`./start.sh --sensor` 会在你确认后帮你装。
2. 权限问题可以试 `sudo backend/.venv/bin/python backend/bridge.py`（pybooklid 的 README 也这么建议）。
3. 关掉其他占用该传感器的程序（例如同时开着的 LidAngleSensor 之类的小工具）。
4. 这个传感器是苹果的私有 HID 设备，只在较新的 MacBook 上有；你的 2021 M1 Max 按你的实验是可读的，但不同系统版本可能有变化。它不能跑在 Docker 里。

**角度范围不对（合上不是 0°、全开超过 130°）**
- `./start.sh --sensor --offset -3`，或 `python3 backend/bridge.py --offset -3`。网页会把超过 130° 的值截断到 130°。

**画面抖**
- 传感器有噪声：`./start.sh --sensor --smooth 0.5`。

**网页黑屏 / 卡顿**
- 必须用 `http://127.0.0.1:…` 打开，不能 file://。
- 阴影已经是 2048、静止时降低更新频率，详见 `PERFORMANCE.md`。还吃力就把窗口缩小；像素比会自己降。

**中文字体**
- 标题用的是系统的宋体/苹方衬线回退；Mac 上正常，缺字体的系统会回退到默认字体。

## 五、传感器读不了怎么办

1. **滑块模式**本身就是完整体验（上面的"先只用滑块看看"）。
2. 用 `?ws=` 接别的输入：按 `docs/PROTOCOL.md` 发 v1 帧，或仍只发 `{"angle": 0~130}`。触控板、MIDI 旋钮、手机陀螺仪都可以做一个自己的小桥。
3. 先用开源的 LidAngleSensor（Swift 原生小工具）确认你的机器在这个系统版本上确实读得到角度，再回来查 `backend/bridge.py`。
4. 看 pybooklid 的 issue / README：<https://github.com/tcsenpai/pybooklid>。

## 六、诚实说明（已验证 / 未验证）

- 已在无头 Chrome（SwiftShader 软件渲染）里验证：各角度渲染、弹簧动画、小猫状态机（探头→跳窗台→彩蛋→哈欠→睡觉）、WebSocket 自动检测与断线回退（用 `backend/bridge.py --fake` 在 Linux 上联调）。
- **`backend/bridge.py` 读真实传感器的那部分没有在真实 Mac 上测试过**。pybooklid 的 API（`LidSensor()` / `read_angle()` / `disconnect()`）是读了 1.0.0 版源码确认的，但不保证在你的机器上一次跑通；原始值范围、是否需要 sudo 都要你实测。
- 灯光、相机是在软件渲染下调的，真 GPU 上（M1 Max）亮度可能略有差异，可以调 `frontend/js/gfx.js` 里的灯光强度。

- v2–v6 的画面（树的立起、速度/停留/晃动/合盖、四季与换季、日晷、小猫的一天、清晨伸懒腰）当时是在无头 Chrome 里对过的。那些按版本堆的脚本已经换成 `tests/unit/` 和一条冒烟，见第七节。**真实声音输出没有人耳听过**：只能证明合成出来的波形不是静音，音色好不好听、音量合不合适要你在 Mac 上自己听，`frontend/js/audio.js` 顶部的参数可调。
- 手感阈值（慢<16°/s、猛>85°/s、晃动判定、合盖快慢）是按"滑块模拟"和对真实开盖速度的估计定的，**没有用真传感器数据校过**，觉得太灵敏/太迟钝就改 `frontend/js/tuning.js` 里的 `TUNING`。
- **影子扫过的观感和霞光颜色是在软件渲染下调的**，真 GPU 上阴影可能更锐利、颜色略有差异，可调 `frontend/js/sky-data.js` 里的 `SUN_ARC`、`DAWN_GLOW`、`DUSK_GLOW`。**真实合页上停 2 秒的手感和真 GPU 下窗内橘猫的观感都没测。**
- 动画时间和 60fps 表现没在真 GPU 上测过；程序内置了一个自适应像素比，持续掉帧会自己降分辨率。
- v8 的检查在 Linux 无头 Chrome 上跑过：`./start.sh test`（ESLint、`tsc --checkJs`、单元测试、一条冒烟）。冒烟仍覆盖假桥、换季、清晨伸懒腰、缝里的眼睛、直角爱心、一整天、轻轻合上、断线回滑块、重连上界。**Docker 镜像和真实 Mac 合页没有在这台机器上跑。** 画质和 draw call 的前后数字在 `PERFORMANCE.md`，测的是 SwiftShader。
- v9 的打包在 Linux 上检查过脚本和 PyInstaller 桥。**没有在 macOS 上打 `.dmg`，也没有用 Homebrew 在 Mac 上安装。** Gatekeeper 的文案是按系统行为写的，没有在真机上点过。

## 七、测试

```bash
./start.sh test --yes
```

会装好检查用的 npm 包和 `tests/requirements.txt`（Playwright、Pillow），然后依次跑 ESLint、`tsc -p tsconfig.json --noEmit`、`node --test tests/unit/*.test.js`、`PYTHONPATH=backend python -m unittest`、以及 `tests/e2e/smoke.py`。有本机 Chrome 就用它（SwiftShader）；没有就装 Playwright 自带的 Chromium。

冒烟自己拉起假桥（默认 WebSocket 18665、健康检查 18666），静态页用 8133。截图失败不会让整次冒烟失败：软件渲染下 `ReadPixels` 可能超时。

---

## 八、⚠️ 剧透：8 个小秘密的答案

> 想自己发现的话，到这里就可以停了。下面是全部答案（角度都是合页角度，"停住"指角度变化不超过约 ±2° 并持续 3 秒，屏幕上会出现一圈进度环）。

| # | 名字 | 怎么触发 |
|---|---|---|
| 1 | 缝里的眼睛 | 书刚裂开一道缝（约 5–15°）时停住 3 秒：缝里会亮起一双眼睛，眨一眨 |
| 2 | 烟囱边的午觉 | 小屋立起来、灯亮了之后（约 58–72° 更容易；52–58° 会先触发 v5 清晨窗边字幕）停住 3 秒：小猫爬上屋顶，靠着烟囱睡着（Zzz、呼噜）。再动一动或点它就醒 |
| 3 | 心动的直角 | 刚好在 90°（±3°）稍停 0.5 秒：小猫睁大眼睛，冒出爱心 |
| 4 | 受惊的猫头鹰 | 开盖速度快于约 85°/s：纸张哗啦抖，右边树上的猫头鹰扑棱棱飞走（过十来秒会飞回来）。点它也会飞，但点的不算发现 |
| 5 | 抖落一身 | 盖子开到 22° 以上，1.6 秒内来回晃 4 次以上（每次幅度 > 1.6°）：花瓣/柳絮/落叶/雪（取决于季节）漫天落下 |
| 6 | 追萤火虫 | 天黑之后（约 109–124°，v4 起从 100° 改为 109°）停住 3 秒：小猫跳下窗台追萤火虫 |
| 7 | 晚安 | 从 60° 以上合到 5° 以下，合盖最大角速度低于约 45°/s（轻轻合）：整屏暗下来，出现"晚安"和当季台词；快过约 120°/s 是"啪！"，介于两者之间是普通合上 |
| 8 | 陪它过完一整天（v4） | 先合到 30° 以下，然后**一路往上开到 122° 以上**：中途往回合不能超过约 5°、不能猛开（超过约 85°/s），并且从 30° 到 122° 用时 **≥ 9 秒**。成功后天空左上角的云散开，9 颗星一颗一颗亮起、连成一只坐着的"猫座"，以后每次开到夜里都在。用时 4–9 秒会看到一句"这一天…过得有点快"的提示 |

其他不计入手账的小反应：慢于约 16°/s 地打开（66°–108° 之间）小猫会害羞，先探头再迟疑地跳上窗台；开得中途突然加快它会缩回去；刚晃完盖子小猫不会打哈欠睡觉。

`window.__popup` 里有测试钩子（`dbg()`、`sweep()`、`settle()`、`forceSeason()` 等），脚本和你在控制台里调试都能用。
