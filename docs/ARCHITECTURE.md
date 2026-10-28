# 结构

网页不读传感器，桥不画场景。玩法判定不碰网格，网格不决定「这一拍发生了什么」。

```mermaid
flowchart LR
  subgraph sources [角度来源]
    Fake[FakeSource]
    Lid[PyBookLidSource]
    Replay[ReplaySource]
  end
  sources --> Broadcast[broadcast.py]
  Broadcast -->|协议 v1| WS[WebSocket]
  Broadcast --> Health["GET /health"]
  WS --> Input[input.js]
  Input --> Sim[sim.js]
  Sim --> Machines[状态机]
  Machines --> Bus[bus.js]
  Bus --> Effects[声音 字幕 存档]
  Sim --> Gfx[gfx.js]
```

## 网页

| 模块 | 职责 |
|---|---|
| `frontend/js/play-machine.js` | 摇晃、猛开、停住、一整天、合盖。改 `S` 上的字段，发出事件 |
| `frontend/js/kitten-machine.js` | 小猫这一拍是 `hidden` / `nap` / `dawn` / `play` |
| `frontend/js/season-machine.js` | 打开过程中的换季进度 |
| `frontend/js/season-beats.js` | 春、冬的两句季节反应，不是秘密 |
| `frontend/js/season-ritual.js` `sky-bands.js` | 换季锋面曲线、每季动机、天空时段权重。不引用 Three |
| `frontend/js/season-sweep.js` `sky-gradient.js` `season-light.js` `season-motif.js` | 扫场粒子、天空渐变、光色、现场合成的短动机 |
| `frontend/js/bus.js` | 同步事件总线 |
| `frontend/js/play-wire.js` | 订阅事件，调用声音、字幕、`discover` |
| `frontend/js/sim-*.js` | 弹簧、网格、灯光。问状态机，不自己写判定 |
| `frontend/js/quality.js` | 隐藏页面不画；像素比和阴影贴图只降不升 |
| `frontend/js/tuning.js` | 手感数字，唯一的一处。分享卡在 `SHARE`，合页拟音和镜头在 `HINGE_FEEL`，开场在 `stage*`，换季仪式在 `ritual*` |
| `frontend/js/share-layout.js` | 分享卡文案和排版。纯函数 |
| `frontend/js/share-border.js` | 手绘边和纸边墨点。纯函数 |
| `frontend/js/share-draw.js` | 把排版画到画布 |
| `frontend/js/share-capture.js` | 读 WebGL、下载、剪贴板、短片 |
| `frontend/js/share-wire.js` | 按钮和 `C`。没在录的时候不读像素 |
| `frontend/js/hinge-feel.js` | 角速度 → 嘎吱、纸声、轻撞、镜头偏移。纯函数 |
| `frontend/js/hinge-audio.js` | 把上面的数字放进 WebAudio，接到主音量 |
| `frontend/js/sim-feel.js` | 套到相机上，并在静音时把拟音让掉 |
| `frontend/js/stage-show.js` | 开场幕布。角度 → 暗角、扫光、分层折纸。不判秘密 |
| `frontend/js/stage-show-view.js` | 把幕布画到暗角和纸片上 |

`S` 仍是运行时状态，`__popup.dbg()` 读的是同一份。状态机没有自己藏一份平行状态。

## 桥

`bridge.py` 只解析参数并选一个适配器。读角度、序号、心跳、`/health` 在 `broadcast.py` 和 `health.py`。适配器契约在 `docs/ADAPTERS.md`。线上的帧格式仍是 `docs/PROTOCOL.md` 的 v1。
