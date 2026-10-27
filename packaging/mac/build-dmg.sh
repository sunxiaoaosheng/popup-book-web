#!/usr/bin/env bash
# macOS：用 hdiutil 把未签名的 .app 打成 .dmg。
# 其他系统：hdiutil 不存在，打印原因后退出 0，方便 Linux CI 接着走。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '[pack] hdiutil 只在 macOS 上有。当前是 %s，跳过 .dmg。\n' "$(uname -s)"
  printf '[pack] 在 Mac 上：packaging/mac/build-app.sh && packaging/mac/build-dmg.sh\n'
  exit 0
fi

APP="$ROOT/dist/Popup Book.app"
[[ -d "$APP" ]] || {
  printf '[pack] 还没有 %s。先跑 packaging/mac/build-app.sh\n' "$APP" >&2
  exit 1
}
command -v hdiutil >/dev/null 2>&1 || {
  printf '[pack] 找不到 hdiutil\n' >&2
  exit 1
}

STAGE="$ROOT/dist/dmg-stage"
DMG="$ROOT/dist/PopupBook-unsigned.dmg"
rm -rf "$STAGE" "$DMG"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create \
  -volname "Popup Book" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  "$DMG"
rm -rf "$STAGE"
printf '[pack] OK  %s（未签名，Gatekeeper 会拦截）\n' "$DMG"
