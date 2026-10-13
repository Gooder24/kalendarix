#!/usr/bin/env bash
# ===========================================================================
# Kalendarix -> Nokia Series 40 (vCalendar 1.0 / .vcs)
# Pushes the exported calendar into the phone via Gammu "restore".
# macOS / Linux counterpart of nokia-s40.bat.
# ===========================================================================
set -u

# Gammu binary: honour $GAMMU override, else expect it on PATH.
GAMMU="${GAMMU:-gammu}"

# Desktop dir: respect XDG on Linux, fall back to ~/Desktop (macOS / default).
DESKTOP="$HOME/Desktop"
if command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
fi
VCS="${VCS:-$DESKTOP/kalendarix-export.vcs}"

echo "Kalendarix -> Nokia Series 40"
echo "Format: vCalendar 1.0 (.vcs)"
echo "File: $VCS"
echo

if ! command -v "$GAMMU" >/dev/null 2>&1; then
  echo "CHYBA: Gammu nie je nainstalovane (alebo nie je v PATH)."
  echo "  macOS:         brew install gammu"
  echo "  Debian/Ubuntu: sudo apt install gammu"
  echo "  Fedora:        sudo dnf install gammu"
  echo "  Arch:          sudo pacman -S gammu"
  exit 1
fi

if [ ! -f "$VCS" ]; then
  echo "CHYBA: subor $VCS neexistuje."
  echo "Najprv exportuj kalendar z Kalendarix na Plochu."
  exit 1
fi

"$GAMMU" identify || { echo "Telefon nenajdeny"; exit 1; }
"$GAMMU" restore "$VCS"
echo
echo "Hotovo! Udalosti su v Nokia Calendar."
