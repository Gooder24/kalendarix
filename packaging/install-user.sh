#!/usr/bin/env bash
# Put a built Kalendarix into the home directory, without root:
#   npm ci && npm run tauri build -- --no-bundle && packaging/install-user.sh
# Installs ~/.local/bin/kalendarix, its menu entry and its icon. `--uninstall` removes them again.
# The data in ~/.config/kalendarix is never touched.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
bin=${XDG_BIN_HOME:-$HOME/.local/bin}
data=${XDG_DATA_HOME:-$HOME/.local/share}
files=("$bin/kalendarix" "$data/applications/kalendarix.desktop" "$data/icons/hicolor/scalable/apps/kalendarix.svg")

if [[ ${1:-} == --uninstall ]]; then
  rm -fv "${files[@]}"
  exit 0
fi

binary=${1:-$root/src-tauri/target/release/kalendarix}
if [[ ! -x $binary ]]; then
  echo "No build at $binary. Run: npm run tauri build -- --no-bundle" >&2
  exit 1
fi

install -Dm755 "$binary" "${files[0]}"
install -Dm644 "$root/packaging/kalendarix.desktop" "${files[1]}"
install -Dm644 "$root/assets/kalendarix.svg" "${files[2]}"
printf 'installed:\n'; printf '  %s\n' "${files[@]}"

case ":$PATH:" in
  *":$bin:"*) ;;
  *) echo "note: $bin is not on PATH" ;;
esac
