@echo off
REM ===========================================================================
REM Kalendarix -> Sony Ericsson (vCalendar 1.0 / .vcs)
REM SE phones (W/K series) are picky: USB must be in "Phone mode" (NOT
REM "File transfer"/MSC), and titles are limited to ~35 chars. Some models
REM need the OBEX/AT connection - set this in gammurc if "identify" fails.
REM ASCII-only text on purpose (cp852 console safe).
REM ===========================================================================
setlocal
set VCS=%USERPROFILE%\Desktop\kalendarix-export.vcs
set GAMMU="C:\Program Files\Gammu\bin\gammu.exe"

echo Kalendarix -^> Sony Ericsson
echo Format: vCalendar 1.0 (.vcs)
echo File: %VCS%
echo.
echo TIP: na telefone vyber USB rezim "Phone mode" (nie "File transfer").

if not exist "%VCS%" (
  echo CHYBA: subor %VCS% neexistuje.
  echo Najprv exportuj kalendar z Kalendarix na Plochu.
  pause & exit /b
)

%GAMMU% identify || (echo Telefon nenajdeny - skontroluj USB rezim "Phone mode" & pause & exit /b)
%GAMMU% restore "%VCS%"
echo.
echo Hotovo! Udalosti su v Organizer / Calendar.
pause
