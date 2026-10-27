#!/usr/bin/env bash
# 在 macOS 上组装未签名的 Popup Book.app。
# Linux / CI 上不把 ELF 塞进 .app：那样的包在 Mac 上不能跑。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '[pack] 这台机器是 %s，不能产出能在 Mac 上运行的 .app。\n' "$(uname -s)"
  printf '[pack] 请在 macOS 上运行 packaging/mac/build-app.sh（会先打出本机的桥）。\n'
  printf '[pack] Linux CI 只做桥的 PyInstaller 冒烟，不把 ELF 装进 .app。\n'
  exit 0
fi

"$ROOT/packaging/mac/build-bridge.sh"
BIN="$ROOT/dist/pyinstaller/popup-book-bridge"
[[ -x "$BIN" ]] || {
  printf '[pack] 缺少 %s\n' "$BIN" >&2
  exit 1
}

APP="$ROOT/dist/Popup Book.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/backend"
cp "$ROOT/packaging/mac/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/packaging/mac/app-launcher.sh" "$APP/Contents/MacOS/popup-book"
chmod 755 "$APP/Contents/MacOS/popup-book"
cp -R "$ROOT/frontend" "$APP/Contents/Resources/frontend"
cp -R "$ROOT/backend/." "$APP/Contents/Resources/backend/"
rm -rf "$APP/Contents/Resources/backend/.venv"
while IFS= read -r -d '' d; do
  rm -rf "$d"
done < <(find "$APP/Contents/Resources/backend" -type d -name '__pycache__' -print0)
find "$APP/Contents/Resources/backend" -type f -name '*.pyc' -delete
cp "$ROOT/start.sh" "$APP/Contents/Resources/start.sh"
cp "$ROOT/README.md" "$APP/Contents/Resources/README.md"
cp "$ROOT/LICENSE" "$APP/Contents/Resources/LICENSE"
chmod 755 "$APP/Contents/Resources/start.sh"
cp "$BIN" "$APP/Contents/Resources/popup-book-bridge"
chmod 755 "$APP/Contents/Resources/popup-book-bridge"
printf '[pack] OK  %s（未签名）\n' "$APP"
