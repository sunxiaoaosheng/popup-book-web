# Homebrew

支持的安装方式是 **formula**：拉源码，依赖 `python@3.12`，命令 `popup-book` 去执行 `./start.sh`。不需要签名过的 `.app`，也不需要 Apple Developer 账号。

cask 只是示例。没有 Mac 上打出来的未签名 dmg 之前，不要 `brew install --cask`。

## 从本机 formula 安装

在仓库根目录：

```bash
brew install --HEAD --formula ./packaging/homebrew/Formula/popup-book.rb
popup-book --help
popup-book --fake --no-docker --yes
```

`--HEAD` 会按 formula 里的 `head` 再克隆一份。现在 `branch` 是 `creative/v9-packaging`。这条分支并进 `main` 之后，把 formula 里的 `branch:` 改成 `"main"`，见 `docs/RELEASE.md`。

没有写稳定版 `url` / `sha256`：GitHub 标签压缩包的校验和要等标签打出来才知道，不能提前写进同一个提交。所以现在不要省略 `--HEAD`。

## 把这个目录当成 tap

`packaging/homebrew/` 就是一个 tap 根目录（`Formula/`、`Casks/`）。

```bash
brew tap sunxiaoaosheng/popup-book "$PWD/packaging/homebrew"
brew install --HEAD sunxiaoaosheng/popup-book/popup-book
```

这不会去 GitHub 拉一个 `homebrew-popup-book` 仓库。formula 还在这个项目里。等 formula 出现在默认分支之后，也可以：

```bash
brew tap sunxiaoaosheng/popup-book https://github.com/sunxiaoaosheng/popup-book-web.git
```

在那之前，远程 tap 的默认分支上没有 `Formula/popup-book.rb`。

## 装好之后

```bash
popup-book                  # 假角度 + 静态页
popup-book --slider         # 只有滑块
popup-book --sensor         # 真实合页。先 brew install hidapi，仅 macOS
popup-book test --yes       # 和 ./start.sh test 一样
```

`popup-book` 就是 `packaging/popup-book`，再转给 `start.sh`。开发时仍以仓库里的 `./start.sh` 为准。

## cask（先别装）

`Casks/popup-book.rb.example` 写了未签名 dmg 的地址和 Gatekeeper 说明。扩展名是 `.example`，`brew tap` 不会把它当成 cask。

在 Mac 上打出 `dist/PopupBook-unsigned.dmg` 并挂到 Release 之后：

1. 用 `dist/SHA256SUMS` 里的 sha256 换掉示例里的全零占位。
2. 把文件复制成 `Casks/popup-book.rb`。
3. 再 `brew install --cask`。

Gatekeeper 仍会拒绝未签名的应用。处理办法在 `packaging/mac/README.md`。买开发者账号之前，用上面的 formula。
