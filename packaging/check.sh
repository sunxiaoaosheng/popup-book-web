#!/usr/bin/env bash
# 打包布局的快速检查。不跑 PyInstaller，也不跑玩法测试。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for f in start.sh packaging/popup-book packaging/check.sh packaging/assemble-release.sh packaging/mac/*.sh; do
  bash -n "$f"
done

help_text="$(./packaging/popup-book --help)"
[[ "$help_text" == *用法* ]] || {
  printf '[pack] popup-book --help 里没有「用法」\n' >&2
  exit 1
}

app_out="$(./packaging/mac/build-app.sh)"
dmg_out="$(./packaging/mac/build-dmg.sh)"
if [[ "$(uname -s)" != "Darwin" ]]; then
  [[ "$app_out" == *不能产出* ]] || {
    printf '[pack] 非 macOS 上 build-app.sh 应说明跳过 .app\n%s\n' "$app_out" >&2
    exit 1
  }
  [[ "$dmg_out" == *hdiutil* ]] || {
    printf '[pack] 非 macOS 上 build-dmg.sh 应说明跳过 .dmg\n%s\n' "$dmg_out" >&2
    exit 1
  }
fi

if command -v ruby >/dev/null 2>&1; then
  ruby -c packaging/homebrew/Formula/popup-book.rb >/dev/null
  ruby -c packaging/homebrew/Casks/popup-book.rb.example >/dev/null
else
  printf '[pack] 没有 ruby，跳过 formula 语法检查\n'
fi

printf '[pack] OK  脚本语法、--help、本机上的 .app/.dmg 行为\n'
