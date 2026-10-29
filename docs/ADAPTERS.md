# 角度适配器

广播服务只依赖这个契约（`backend/sensors/base.py`）：

| 成员 | 含义 |
|---|---|
| `name` | 日志里的短名 |
| `mode` | 写进 `/health` 的 `mode`：`fake`、`sensor` 或 `replay` |
| `read()` | 当前角度（度）。没有有效值时返回 `None`，这一拍不发角度帧 |
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

`#` 开头的行忽略。空文件会拒绝启动。

## 再加一个

1. 在 `backend/sensors/` 里实现上面的四个成员。
2. `bridge.py` 的 `build_source()` 里加一个开关，把它交给 `serve()`。
3. 不要改 `protocol.py` 的字段，除非按 `docs/PROTOCOL.md` 升版本。

`/health` 和 WebSocket 的端口、帧格式保持不变。角度字段保持不变。

## 力度不是角度适配器

Force Touch 不实现上面的四个成员，也不能拿来替换合页。它是广播旁边的一条可选读数：

| 来源 | 行为 |
|---|---|
| 角度源实现了 `read_weight()` | 广播用它。回放文件里的可选 `"weight"` 走这里。没有这个键时返回 `None` |
| 否则 | macOS 上尝试触控板，放在单独的子进程里。失败、退出、或不是 macOS：`read()` 为 `None` |

`None` 表示这一拍不写 `weight`。网页把缺字段当成「没有力度通道」，不会把小猫卡在闻东西的姿势上，也不会弹出错误。`0` 才表示板子是空的。

合页的 `read()` 仍然只返回角度。
