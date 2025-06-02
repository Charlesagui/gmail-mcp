@echo off
echo 🔒 Secure Gmail MCP Server - Instalación Automática
echo ================================================

echo 📦 Instalando dependencias...
npm install

if %errorlevel% neq 0 (
    echo ❌ Error instalando dependencias
    pause
    exit /b 1
)

echo 🔨 Compilando TypeScript...
npm run build

if %errorlevel% neq 0 (
    echo ❌ Error compilando proyecto
    pause
    exit /b 1
)

echo.
echo ✅ Instalación completada!
echo.
echo Próximos pasos:
echo 1. Ejecutar autenticación: npm run auth
echo 2. Verificar configuración: npm run test
echo 3. Configurar Claude Desktop con:
echo    %CD%\claude_desktop_config.example.json
echo.
echo 🔐 Credenciales OAuth ya configuradas en:
echo    %USERPROFILE%\.secure-gmail-mcp\credentials.json
echo.
pause
