# 角度适配器

广播服务只依赖这个契约（`backend/sensors/base.py`）：

| 成员 | 含义 |
|---|---|
| `name` | 日志里的短名 |
| `mode` | 写进 `/health` 的 `mode`：`fake`、`sensor` 或 `replay` |
| `read()` | 当前角度（度）。没有有效值时返回 `None`，这一拍不发角度帧 |
| `read_light()` | 可选。当前勒克斯。没有就返回 `None`，不要抛。广播会省略 `light` |
| `pull_taps()` | 上次调用之后的轻拍。每项是 `{"kind", "strength"}`。不要返回波形。默认空列表 |
| `close()` | 释放设备或文件。可以调用多次 |

`read()` 不要堵住广播循环。真实传感器自己用线程更新最新值。

平滑、偏移、钳位、序号、心跳都不在适配器里。那些在 `backend/broadcast.py`。

## 现成的三个

| 类 | 文件 | 怎么选 | `mode` |
|---|---|---|---|
| `FakeSource` | `sensors/fake.py` | `--fake` | `fake` |
| `PyBookLidSource` | `sensors/lid.py` | 两个开关都不写。仅 macOS，需要 pybooklid | `sensor` |
| `ReplaySource` | `sensors/replay.py` | `--replay trace.jsonl` | `replay` |

回放文件一行一个 JSON，`t` 是从按下播放起的秒，要非递减：

```json
{"t": 0, "angle": 12}
{"t": 1.5, "angle": 40}
{"t": 9, "angle": 120}
```

`#` 开头的行忽略。空文件、或一行角度都没有，会拒绝启动。行里可以多写 `"light"`（勒克斯）。没有这个字段、或不是有限数字时，这一行不带环境光。

轻拍可以单独成行，也可以和角度写在一起。波形字段即使出现也不会被保存：

```json
{"t": 0.4, "kind": "slap", "strength": 0.3}
{"t": 1.2, "angle": 40, "kind": "double-knock", "strength": 0.5, "light": 42}
```

`kind` 只能是 `slap`、`double-knock`、`triple-knock`。

假角度还会带一圈演示用的环境光：周期起点约 0 lx（夜），半程约 900 lx（白天），再回到夜，中间经过黄昏。`POPUP_LUX` 设成有限数字时，假角度和真实合页都改发这个固定值；没设、或设坏了，真实合页就省略 `light`。回放不看 `POPUP_LUX`。

读不到环境光时桥不报错，网页安静地继续用书里的时间。

## 再加一个

1. 在 `backend/sensors/` 里实现上面的成员。`read_light` 可以先不写。
2. `bridge.py` 的 `build_source()` 里加一个开关，把它交给 `serve()`。
3. 角度帧保持 v1，可选字段只有 `light`（见 `docs/PROTOCOL.md`）。轻拍是另加的 `type: "tap"`（`kind` + `strength`），不要在适配器里塞波形。除此以外不要改字段，除非升版本。

`/health` 和 WebSocket 的端口、帧格式保持不变。
