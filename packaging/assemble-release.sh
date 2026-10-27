#!/usr/bin/env bash
# 组装 GitHub Release 要用的文件到 dist/。不调用 gh，不签名。
# 用法: ./packaging/assemble-release.sh v9
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
[[ "$TAG" == v* ]] || {
  printf '[pack] 需要像 v9 这样的标签名\n' >&2
  exit 1
}

mkdir -p "$ROOT/dist"
TAR="$ROOT/dist/popup-book-${TAG}-source.tar.gz"
ZIP="$ROOT/dist/popup-book-${TAG}-source.zip"
git archive --format=tar.gz --prefix="popup-book-${TAG}/" -o "$TAR" HEAD
git archive --format=zip --prefix="popup-book-${TAG}/" -o "$ZIP" HEAD

OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
if [[ "$OS_NAME" == "darwin" ]]; then
  "$ROOT/packaging/mac/build-app.sh"
  "$ROOT/packaging/mac/build-dmg.sh"
else
  "$ROOT/packaging/mac/build-bridge.sh"
  "$ROOT/packaging/mac/build-dmg.sh"
fi

BRIDGE="$ROOT/dist/pyinstaller/popup-book-bridge"
BRIDGE_TAR="$ROOT/dist/popup-book-bridge-${OS_NAME}-${ARCH}.tar.gz"
if [[ -x "$BRIDGE" ]]; then
  tar -C "$ROOT/dist/pyinstaller" -czf "$BRIDGE_TAR" popup-book-bridge
else
  printf '[pack] 没有桥二进制，跳过 %s\n' "$BRIDGE_TAR" >&2
fi

NOTES="$ROOT/dist/release-notes.md"
cat >"$NOTES" <<EOF
# ${TAG}

未签名。没有 Apple Developer ID，没有公证，没有 App Store。

这个 Release 在 Linux 上组装：

- \`popup-book-${TAG}-source.tar.gz\` / \`.zip\`：\`git archive\` 打出来的源码（含 \`packaging/\`）。校验和用这份文件，不要用 GitHub 自动附带的 source archive，两者 sha256 不一样。
- \`popup-book-bridge-${OS_NAME}-${ARCH}.tar.gz\`：PyInstaller 打的桥，只含 \`websockets\`。\`--sensor\` 需要的 pybooklid 不在里面。
- macOS 的 \`.app\` / \`.dmg\` 只有在 Mac 上跑 \`packaging/mac/build-app.sh\` 和 \`build-dmg.sh\` 才会出现。Linux 上那一步会跳过。

安装见 \`packaging/homebrew/README.md\`。Gatekeeper 见 \`packaging/mac/README.md\`。本地仍用 \`./start.sh\`。
EOF

SUMS="$ROOT/dist/SHA256SUMS"
sum_files=("$TAR" "$ZIP")
[[ -f "$BRIDGE_TAR" ]] && sum_files+=("$BRIDGE_TAR")
[[ -f "$ROOT/dist/PopupBook-unsigned.dmg" ]] && sum_files+=("$ROOT/dist/PopupBook-unsigned.dmg")
sum_names=()
for f in "${sum_files[@]}"; do
  sum_names+=("$(basename "$f")")
done
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$ROOT/dist" && sha256sum "${sum_names[@]}" > SHA256SUMS)
elif command -v shasum >/dev/null 2>&1; then
  (cd "$ROOT/dist" && shasum -a 256 "${sum_names[@]}" > SHA256SUMS)
else
  printf '[pack] 没有 sha256sum 或 shasum，跳过 SHA256SUMS\n' >&2
  rm -f "$SUMS"
fi

printf '[pack] OK  产物在 dist/（不要提交）\n'
if [[ -f "$SUMS" ]]; then
  cat "$SUMS"
fi
