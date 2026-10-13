#!/usr/bin/env bash
# ===========================================================================
# Kalendarix -> Universal feature phone (vCalendar 1.0 / .vcs)
# Fallback for Motorola, Samsung, Siemens/BenQ and any other phone Gammu
# can talk to. Conservative vCalendar 1.0 file (no recurrence/location on
# the strictest profiles).
# macOS / Linux counterpart of generic.bat.
# ===========================================================================
set -u

GAMMU="${GAMMU:-gammu}"

DESKTOP="$HOME/Desktop"
if command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
fi
VCS="${VCS:-$DESKTOP/kalendarix-export.vcs}"

echo "Kalendarix -> Univerzalny telefon (vCalendar 1.0)"
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

"$GAMMU" identify || { echo "Telefon nenajdeny - pozri README.md (gammu-detect)"; exit 1; }
"$GAMMU" restore "$VCS"
echo
echo "Hotovo! Udalosti by mali byt v kalendari telefonu."
echo "Ak restore zlyha, skus: $GAMMU addnew \"$VCS\""
