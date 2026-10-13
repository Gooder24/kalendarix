# Nokia Export — Návod na gammu

Kalendarix vie exportovať tvoje udalosti do `.vcs` súboru (vCalendar 1.0),
ktorému rozumejú staršie Nokia telefóny (napr. **Nokia C2-01**). Tento návod
popisuje ako súbor dostať do telefónu pomocou nástroja **gammu**.

## Čo potrebuješ

- Nokia C2-01 s USB káblom
- [gammu](https://wammu.eu/gammu/) (stiahni na gammu.org)
- Tento `.bat` skript (ulož ako `nokia-sync.bat`)

## Inštalácia gammu

1. Stiahni `gammu-setup.exe` z [gammu.org/install/win](https://wammu.eu/download/)
2. Nainštaluj do `C:\Program Files\Gammu\`
3. Zapoj Nokiu, vyber **„PC Suite"** na telefóne
4. Spusti: `gammu-detect` → skopíruj výstup do `.gammurc`

## .bat skript

Vytvor súbor `nokia-sync.bat`:

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

## Týždenná rutina

1. V Kalendarixe: **Nastavenia → Export do telefónu** → ulož ako `nokia-export.vcs` na Plochu
2. Zapoj Nokiu cez USB
3. Dvojklik na `nokia-sync.bat`
4. Hotovo — udalosti sú v Nokia Calendar

## Problémy

- **„Telefon nenajdeny"** → skontroluj USB kábel a režim PC Suite
- **Udalosti sa nezobrazia** → skontroluj či má Nokia nastavený správny dátum a čas
