#!/usr/bin/env bash
# Regenerate the compiled Tailwind CSS and inline it into index.html.
# RUN THIS whenever you add or remove Tailwind utility classes in index.html —
# unlike the old runtime CDN, new classes need a rebuild to get their CSS.
# No npm required: uses Tailwind's standalone CLI (auto-downloaded once).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$DIR/.tailwindcss"
if [ ! -x "$CLI" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) BIN=tailwindcss-macos-arm64;;
    Darwin-x86_64) BIN=tailwindcss-macos-x64;;
    Linux-x86_64) BIN=tailwindcss-linux-x64;;
    Linux-aarch64|Linux-arm64) BIN=tailwindcss-linux-arm64;;
    *) echo "Unsupported platform: $(uname -s)-$(uname -m)"; exit 1;;
  esac
  echo "Downloading tailwindcss standalone CLI ($BIN)…"
  curl -fsSL -o "$CLI" "https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.16/$BIN"
  chmod +x "$CLI"
fi
"$CLI" build -c "$DIR/tailwind.config.js" -i "$DIR/tailwind-input.css" -o "$DIR/.tw-out.css" --minify
python3 "$DIR/scripts/inject-css.py"
rm -f "$DIR/.tw-out.css"
echo "Done — compiled CSS inlined between the <style id=\"tw-compiled\"> markers in index.html."
