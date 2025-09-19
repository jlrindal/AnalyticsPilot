@echo off
echo Building PowerBI Proxy Service for production...

REM Build self-contained executable for Windows x64
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true

if errorlevel 1 (
    echo Failed to build proxy service
    exit /b %errorlevel%
)

echo Successfully built self-contained proxy service

REM Copy the self-contained executable to the main bridge directory for easier packaging
if exist "bin\Release\net6.0\win-x64\publish\PowerBIProxy.exe" (
    copy "bin\Release\net6.0\win-x64\publish\PowerBIProxy.exe" "PowerBIProxy.exe"
    echo Copied executable to bridge root directory
)
