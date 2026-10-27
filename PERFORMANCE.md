# 卡顿和假死：查到了什么、改了什么

纸艺画面没砍。下面是对着 v6 的 `main.js` 对出来的原因，以及现在落在哪。

## 假死：WebSocket 重连翻倍

默认就会连 `ws://localhost:8765`。桥没开时（滑块模式就是这样），浏览器对一次失败会先触发 `error`，再触发 `close`。

旧代码把两个事件绑成同一个回调：

```js
ws.onclose = ws.onerror = () => { ws = null; setTimeout(connectWS, 2000); };
```

一次失败预约两次重连，下一次再翻倍。几分钟后主线程上堆着几十上百个正在握手的 socket，页面假死，只能整页刷新。

`frontend/js/input.js` 改成：`error` 只负责 `close()`，只有 `close` 预约下一次，而且同时只允许一个定时器、一条 CONNECTING/OPEN 的连接。断着的桥大约每 2 秒一次尝试，次数是线性的。

同一帧里桥可能推来好几条角度。现在先留最新的一条字符串，到 `requestAnimationFrame` 里再 `JSON.parse` 一次（`W.net.coalesced` 计数被丢掉的中间帧）。

## 掉帧：每帧重画一张 4096² 软阴影

日晷每帧都在挪平行光。Three r160 在 `shadowMap.autoUpdate !== false` 时会因此每帧重绘整张阴影贴图。旧设置是：

- `PCFSoftShadowMap`，`mapSize` 4096，`radius` 3
- `preserveDrawingBuffer: true`（每帧末尾多一次缓冲拷贝，合成线程容易被拖住）
- `cut()` / `box()` 默认 `castShadow = true`，花、石子、远处的松、云都在投

静止时也是 60fps 全量阴影，这是持续卡顿的主要来源。换季本身不重建几何，材质是在原有 `matCache` 上插值，这条「换季泄漏」的猜测排除了。

`frontend/js/gfx.js`：

- 阴影贴图 2048，软阴影半径仍是 3，纸片影子还在
- `shadowMap.autoUpdate = false`。角度在动（日晷要跟手）时每帧更新；停住后大约 6Hz，只跟上呼吸和烟
- `preserveDrawingBuffer` 默认关。截图像素要保留缓冲时加 `?pdb=1`
- 像素比上限 1.75；连续 2 秒平均帧时间超过 28ms 再往下降
- 标签页隐藏时只排空输入，不模拟、不画

`frontend/js/materials.js` 的花、石子、远松、云传入 `shadow=false`，不再投射。树、木屋、小猫、猫头鹰、山还投。

粒子 `InstancedMesh.count` 设成当前可见数量，隐藏的那部分不再每帧写矩阵。星星弹簧在目标为 0 且已经静止时跳过。看不见的萤火虫不更新（被追的那一只除外）。

## 主线程上的小分配和 DOM

这些单独不至于假死，但会把帧时间顶出尖刺：

| 原来 | 现在 |
|---|---|
| 每帧 `scene.background.set('#2a211b')` 解析颜色字符串 | `sim-stage.js` 里两份缓存的 `Color` |
| 每帧 `TIMES.filter(...).pop()` 分配数组 | `timeOfDay()` 倒序扫描 |
| HUD 文本、圆点、滑块每 50ms 重写 | 脏检查；角度数字最多 10Hz |
| 字幕每次 `textContent` 赋值 | 文案没变就不碰 DOM |
| 进度环每帧 `classList` 增删 | 只在开关状态变化时改 class，`strokeDashoffset` 按 0.1 精度变化才写 |
| 弹簧 `ceil(dt/0.006)` 在卡顿后的大 dt 上子步很多 | 子步上限 8。60fps 时原来就是 3 步，手感对齐 |
| 环境音自动化每 60ms 堆一条 | `audio.js` 里 `setEnv` 门限改为约 10Hz |

隐藏标签页回来时 `dt` 仍被夹到 0.05s，避免一帧追完整段后台时间。

## v7：协议不回到主线程热路径上

角度帧仍是「留下最新一条字符串，每帧解析一次」。心跳和角度共用序号，心跳不带 `angle`，也不刷新网页用来判断过期的那次收包时间，所以空转的心跳不会把「角度过期」藏住。

健康检查是旁边一个标准库 HTTP 服务（`/health`），不走 WebSocket 的握手钩子，也不在广播循环里做请求处理。
