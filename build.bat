@echo off
setlocal EnableDelayedExpansion

rem ===========================================================================
rem  Dissora - build + global kurulum
rem
rem  Akis:
rem    1. bagimliliklari kur   (npm install)
rem    2. release dogrula      (lint + typecheck + build + test)
rem    3. paket olustur        (npm pack  ->  dissora-<surum>.tgz)
rem    4. global kur           (npm install -g <tarball>)
rem    5. dogrula              (dissora --version)
rem
rem  Neden tarball?
rem  `npm install -g .` Windows'ta kaynak klasoru **junction** olarak
rem  baglar: `files`, `prepack` ve paketleme hic uygulanmaz, global
rem  kurulum kaynak agacini (testler, tsconfig, .gitignore ...) gostermeye
rem  devam eder. `npm pack` gercek paketi uretir, `files` listesini
rem  uygular ve tarball global olarak kurulunca cikti **ayni** kalir.
rem
rem  `npm link` de kullanilmaz: calisan agaca baglanir, sonraki
rem  `npm run build` ciktilarini aninda yansitir.
rem ===========================================================================

cd /d "%~dp0"

set "TGZ="
set "TMPDIR_DISSORA=%TEMP%\dissora-pack-%RANDOM%%RANDOM%"

echo.
echo [1/5] Bagimliliklar kuruluyor...
call npm install
if errorlevel 1 goto :fail_dependencies

echo.
echo [2/5] Release dogrulaniyor (lint, typecheck, build, test)...
call npm run release
if errorlevel 1 goto :fail_release

echo.
echo [3/5] Paket olusturuluyor (npm pack)...
rem `npm pack --pack-destination` dizini **yaratmaz**; ENOENT verir.
if not exist "%TMPDIR_DISSORA%" mkdir "%TMPDIR_DISSORA%"
if not exist "%TMPDIR_DISSORA%" goto :fail_pack

call npm pack --pack-destination "%TMPDIR_DISSORA%"
if errorlevel 1 goto :fail_pack

rem `npm pack` dosya adini son satira yazar; bosluk/sekilli adlari
rem guvenli sekilde yakalamak icin gercek dosyayi dizinde arariz.
for %%F in ("%TMPDIR_DISSORA%\*.tgz") do set "TGZ=%%~fF"
if "%TGZ%"=="" goto :fail_pack

echo.
echo [4/5] Global kuruluyor...
call npm install -g "%TGZ%"
if errorlevel 1 goto :fail_global

echo.
echo [5/5] Global kurulum dogrulaniyor...
call dissora --version
if errorlevel 1 goto :fail_verify

rem Artik gereksiz: tarball zaten kuruldu.
call rmdir /s /q "%TMPDIR_DISSORA%" 2>nul

echo.
echo ==========================================================
echo  Dissora basariyla kuruldu ve dogrulandi.
echo
echo Kullanim:
echo   dissora --help
echo   dissora create ^<proje^>
echo   dissora module create ^<ad^>
echo   dissora start
echo ==========================================================
echo.
endlocal
exit /b 0

rem ---------------------------------------------------------------------------

:fail_dependencies
echo.
echo HATA: bagimliliklar kurulamadi.
goto :failed

:fail_release
echo.
echo HATA: release dogrulamasi basarisiz (lint / typecheck / test / build).
echo Yukaridaki ciktiyi inceleyin. Global kurulum yapilmadi.
goto :failed

:fail_pack
echo.
echo HATA: paket olusturulamadi (npm pack).
echo "files" ve "prepack" ayarlarini kontrol edin.
goto :failed

:fail_global
echo.
echo HATA: global kurulum basarisiz.
echo Yonetici hakki gerekebilir: sag tik - Yonetici olarak calistir.
goto :failed

:fail_verify
echo.
echo HATA: kurulum tamamlandi ama "dissora --version" calismadi.
echo Global npm bin klasorunun PATH icinde oldugunu kontrol edin.
echo   npm prefix -g
goto :failed

:failed
echo.
echo ==========================================================
echo  BUILD BASARISIZ
echo ==========================================================
echo.
endlocal
exit /b 1