#!/usr/bin/env bash
# ===========================================================================
# Kalendarix -> Sony Ericsson (vCalendar 1.0 / .vcs)
# SE phones (W/K series) are picky: USB must be in "Phone mode" (NOT
# "File transfer"/MSC), and titles are limited to ~35 chars. Some models
# need the OBEX/AT connection - set this in gammurc if "identify" fails.
# macOS / Linux counterpart of sonyericsson.bat.
# ===========================================================================
set -u

GAMMU="${GAMMU:-gammu}"

DESKTOP="$HOME/Desktop"
if command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
fi
VCS="${VCS:-$DESKTOP/kalendarix-export.vcs}"

echo "Kalendarix -> Sony Ericsson"
echo "Format: vCalendar 1.0 (.vcs)"
echo "File: $VCS"
echo "TIP: na telefone vyber USB rezim \"Phone mode\" (nie \"File transfer\")."
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

"$GAMMU" identify || { echo "Telefon nenajdeny - skontroluj USB rezim \"Phone mode\""; exit 1; }
"$GAMMU" restore "$VCS"
echo
echo "Hotovo! Udalosti su v Organizer / Calendar."
