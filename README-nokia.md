# Nokia Export — gammu guide

Kalendarix can export your events to a `.vcs` file (vCalendar 1.0),
which older Nokia phones understand (e.g. **Nokia C2-01**). This guide
describes how to get the file into the phone using the **gammu** tool.

## What you need

- A Nokia C2-01 with a USB cable
- [gammu](https://wammu.eu/gammu/) (download it from gammu.org)
- This `.bat` script (save it as `nokia-sync.bat`)

## Installing gammu

1. Download `gammu-setup.exe` from [gammu.org/install/win](https://wammu.eu/download/)
2. Install it to `C:\Program Files\Gammu\`
3. Plug in the Nokia, choose **"PC Suite"** on the phone
4. Run: `gammu-detect` → copy the output into `.gammurc`

## .bat script

Create a file `nokia-sync.bat`:

```bat
@echo off
set VCS=%USERPROFILE%\Desktop\nokia-export.vcs
set GAMMU="C:\Program Files\Gammu\bin\gammu.exe"
echo Kontrolujem telefon...
%GAMMU% identify || (echo Telefon nenajdeny. & pause & exit /b)
echo Nahravam kalendar...
%GAMMU% restore "%VCS%"
echo Hotovo!
pause
```

## Weekly routine

1. In Kalendarix: **Settings → Export to a phone** (*Nastavenia → Export do telefónu* in the Slovak interface) → save as `nokia-export.vcs` on the Desktop
2. Plug the Nokia in over USB
3. Double-click `nokia-sync.bat`
4. Done — the events are in Nokia Calendar

## Problems

- **"Telefon nenajdeny"** ("phone not found") → check the USB cable and PC Suite mode
- **The events do not show up** → check that the Nokia has the correct date and time set
