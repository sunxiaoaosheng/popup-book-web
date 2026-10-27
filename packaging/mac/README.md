# 未签名的 Mac 包

这里没有代码签名，没有公证，也没有 App Store。Apple Developer ID 先不做：先让别人能从源码或 Homebrew formula 跑起来。

日常本机开发用仓库根目录的 `./start.sh`。下面的脚本是分发用的。

## 脚本

| 脚本 | 做什么 |
|---|---|
| `build-bridge.sh` | PyInstaller 把 `backend/bridge.py` 打成单个文件，并用假角度打一次 `/health`。Linux 上是 ELF，macOS 上是 Mach-O。不含 `pybooklid`。 |
| `build-app.sh` | 只在 macOS 上组装 `dist/Popup Book.app`（静态页 + 上面的桥 + `start.sh`）。其他系统打印原因后退出 0，不会把 Linux 二进制塞进 `.app`。 |
| `build-dmg.sh` | macOS 上用 `hdiutil` 打 `dist/PopupBook-unsigned.dmg`。没有 `hdiutil` 时打印原因后退出 0。 |

在 Mac 上：

```bash
./packaging/mac/build-app.sh
./packaging/mac/build-dmg.sh
```

`.app` 的可执行文件会设置 `POPUP_BRIDGE_BIN`，再执行包内的 `start.sh --no-docker`。从终端运行时能看见日志。双击时没有终端，日志在 `~/Library/Logs/popup-book.log`，健康之后会用 `open` 打开页面。

## Gatekeeper

未签名的应用，macOS 会说 **「无法验证开发者」**，有时显示成已损坏。这不是包坏了。

1. 在 Finder 里对 `Popup Book.app` **右键 → 打开**，在对话框里再点一次「打开」。只双击会被直接拦下。
2. 若仍被拦：打开 **系统设置 → 隐私与安全性**，在页面下方点 **仍要打开**。
3. 不要用 `sudo spctl --master-disable` 关掉整个 Gatekeeper。

dmg 只是把这个未签名的 `.app` 装进磁盘映像，过不了公证，同样要按上面放行。

## 合页传感器

真实角度是 Mac 的 HID，要主机权限。打包进去的桥只有 `websockets`，给 `--fake` 用。

`--sensor` 仍走本机 Python：`brew install hidapi`，再用仓库里的 `./start.sh --sensor`（或没设置 `POPUP_BRIDGE_BIN` 的 `popup-book --sensor`）。不要指望未签名 `.app` 里的桥去读合页。

## 这台 Linux 机器上

`build-app.sh` 和 `build-dmg.sh` 会跳过，并写明原因。能验证的是 `build-bridge.sh` 打出的 Linux 桥，以及脚本本身。`.dmg` 要在 Mac 上才能打。
