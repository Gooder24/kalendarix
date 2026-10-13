@echo off
REM ===========================================================================
REM Kalendarix -> Nokia Series 40 (vCalendar 1.0 / .vcs)
REM Pushes the exported calendar into the phone via Gammu "restore".
REM ASCII-only text on purpose (cp852 console safe).
REM ===========================================================================
setlocal
set VCS=%USERPROFILE%\Desktop\kalendarix-export.vcs
set GAMMU="C:\Program Files\Gammu\bin\gammu.exe"

echo Kalendarix -^> Nokia Series 40
echo Format: vCalendar 1.0 (.vcs)
echo File: %VCS%
echo.

if not exist "%VCS%" (
  echo CHYBA: subor %VCS% neexistuje.
  echo Najprv exportuj kalendar z Kalendarix na Plochu.
  pause & exit /b
)

%GAMMU% identify || (echo Telefon nenajdeny & pause & exit /b)
%GAMMU% restore "%VCS%"
echo.
echo Hotovo! Udalosti su v Nokia Calendar.
pause
