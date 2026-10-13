@echo off
REM ===========================================================================
REM Kalendarix -> Nokia S60 / Symbian (iCalendar 2.0 / .vcs)
REM S60 phones speak full iCalendar 2.0 (VEVENT + VALARM + VTIMEZONE + UID).
REM Use Gammu "restore"; if the phone rejects it, try addnew (see README).
REM ASCII-only text on purpose (cp852 console safe).
REM ===========================================================================
setlocal
set VCS=%USERPROFILE%\Desktop\kalendarix-export.vcs
set GAMMU="C:\Program Files\Gammu\bin\gammu.exe"

echo Kalendarix -^> Nokia S60 (Symbian)
echo Format: iCalendar 2.0 (.vcs / .ics)
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
echo Hotovo! Udalosti su v Calendar (Symbian).
echo Poznamka: S60 pouziva iCalendar 2.0 - cas je viazany na zonu Europe/Bratislava.
pause
