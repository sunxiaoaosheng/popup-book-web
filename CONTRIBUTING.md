# 参与修改

先把书跑起来，再改代码。

```bash
./start.sh --fake --no-docker --yes
./start.sh test --yes
```

`./start.sh test` 会跑 ESLint、`tsc --checkJs`、单元测试和无头冒烟。改完判定或协议，这两条都要过。

## 代码放哪

- 手感数字只加在 `frontend/js/tuning.js`。
- 「这一拍算不算」放在状态机（`play-machine.js`、`kitten-machine.js`、`season-machine.js`、`season-beats.js`），用 `frontend/js/bus.js` 把结果交出去。网格、声音、字幕留在原来的订阅端。
- 新的角度来源实现 `docs/ADAPTERS.md` 的契约，不要改 v1 帧的字段名。
- 纯函数用 `node --test` 或 `unittest` 测。需要浏览器的行为加在 `tests/e2e/smoke.py` 这一条里，不要再按版本堆脚本。

用户看的说明用中文，和 README 一样。

## 提交

一次改动一件事。提交说明写做了什么、为什么。不要提交 `node_modules/`、`backend/.venv/`、`shots/`、`.run/`。

真实 Mac 合页和 Docker 镜像不是每台机器都有。没跑过的部分在说明里写明，不要当成已经验证。
