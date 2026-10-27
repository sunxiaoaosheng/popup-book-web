# 发布

标签是普通版本号，例如 `v9`。不要加 `creative/` 前缀。用附注标签，推上去之后 `.github/workflows/release.yml` 会在 `ubuntu-latest` 上组装并创建 GitHub Release。

没有签名、公证、App Store。Linux 上的 Release **不会**带 `.app` 或 `.dmg`。

## 打标签

在要发布的提交上（先跑过 `./start.sh test --yes`）：

```bash
git tag -a v9 -m "v9: Homebrew formula, unsigned Mac scripts, GitHub Release."
git push origin v9
```

workflow 做这些事：

1. `git archive` 打出 `popup-book-v9-source.tar.gz` 和 `.zip`（前缀 `popup-book-v9/`）。
2. `packaging/mac/build-bridge.sh`：Linux 上的 PyInstaller 桥，冒烟通过才继续。
3. `packaging/mac/build-dmg.sh`：在 Linux 上只打印「hdiutil 只在 macOS 上有」并退出 0。
4. `gh release create` 上传源码包、`popup-book-bridge-linux-<arch>.tar.gz`、`SHA256SUMS`。若将来在 Mac 上组装，同名的 `PopupBook-unsigned.dmg` 也会被上传。

本地可以先组装、不发布：

```bash
./packaging/assemble-release.sh v9
```

产物在 `dist/`，已 gitignore。

## 校验和

公式和 cask 要用 **Release 里的** `popup-book-<tag>-source.tar.gz`，不要用 GitHub 自动生成的 source code 附件。自动附件的字节和 `git archive` 不一样，sha256 对不上。

`SHA256SUMS` 里每一行对应一个上传的文件。

## 稳定版 formula

现在的 formula 只有 `head`，分支是 `creative/v9-packaging`。并进 `main` 之后：

1. 把 `packaging/homebrew/Formula/popup-book.rb` 里的 `branch:` 改成 `"main"`。
2. 若要做不带 `--HEAD` 的安装，按 `SHA256SUMS` 填上（版本号按当次标签改）：

```ruby
url "https://github.com/sunxiaoaosheng/popup-book-web/releases/download/v9/popup-book-v9-source.tar.gz"
sha256 "<SHA256SUMS 里 popup-book-v9-source.tar.gz 那一行>"
```

`url` 和 `sha256` 不能写在产生这个压缩包的同一个提交里：哈希要等文件存在才知道。

## 未签名 dmg

在 Mac 上：

```bash
./packaging/mac/build-app.sh
./packaging/mac/build-dmg.sh
```

把 `dist/PopupBook-unsigned.dmg` 加到该版本的 Release，把 sha256 写进 `packaging/homebrew/Casks/popup-book.rb`（从 `.example` 复制）。Gatekeeper 的说明在 `packaging/mac/README.md`。这一步不在 Linux CI 里做。

## workflow 还没出现在默认分支时

`workflow_dispatch` 没有打开。标签推送使用的是 **标签指向的提交** 里的 `release.yml`，不要求文件已经在 `main` 上。`v*` 会触发。不要给已经发过的 `v7`、`v8` 再推一次。
