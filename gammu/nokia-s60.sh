#!/usr/bin/env bash
# ===========================================================================
# Kalendarix -> Nokia S60 / Symbian (iCalendar 2.0 / .vcs)
# S60 phones speak full iCalendar 2.0 (VEVENT + VALARM + VTIMEZONE + UID).
# Use Gammu "restore"; if the phone rejects it, try addnew (see README).
# macOS / Linux counterpart of nokia-s60.bat.
# ===========================================================================
set -u

GAMMU="${GAMMU:-gammu}"

DESKTOP="$HOME/Desktop"
if command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
fi
VCS="${VCS:-$DESKTOP/kalendarix-export.vcs}"

echo "Kalendarix -> Nokia S60 (Symbian)"
echo "Format: iCalendar 2.0 (.vcs / .ics)"
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
echo "Hotovo! Udalosti su v Calendar (Symbian)."
echo "Poznamka: S60 pouziva iCalendar 2.0 - cas je viazany na zonu Europe/Bratislava."
echo "Ak restore zlyha, skus: $GAMMU addnew \"$VCS\""
