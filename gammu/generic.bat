@echo off
REM ===========================================================================
REM Kalendarix -> Universal feature phone (vCalendar 1.0 / .vcs)
REM Fallback for Motorola, Samsung, Siemens/BenQ and any other phone Gammu
REM can talk to. Conservative vCalendar 1.0 file (no recurrence/location on
REM the strictest profiles). ASCII-only text (cp852 console safe).
REM ===========================================================================
setlocal
set VCS=%USERPROFILE%\Desktop\kalendarix-export.vcs
set GAMMU="C:\Program Files\Gammu\bin\gammu.exe"

echo Kalendarix -^> Univerzalny telefon (vCalendar 1.0)
echo File: %VCS%
echo.

if not exist "%VCS%" (
  echo CHYBA: subor %VCS% neexistuje.
  echo Najprv exportuj kalendar z Kalendarix na Plochu.
  pause & exit /b
)

%GAMMU% identify || (echo Telefon nenajdeny - pozri README.md (gammu-detect) & pause & exit /b)
%GAMMU% restore "%VCS%"
echo.
echo Hotovo! Udalosti by mali byt v kalendari telefonu.
echo Ak restore zlyha, skus: %GAMMU% addnew "%VCS%"
pause
