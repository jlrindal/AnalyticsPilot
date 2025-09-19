@echo off
echo Starting Power BI Proxy Service...

cd /d "%~dp0"

echo Building .NET service...
dotnet build PowerBIProxy.csproj -c Release

if %ERRORLEVEL% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo Starting service on http://localhost:8080...
dotnet run --project PowerBIProxy.csproj -c Release

pause 