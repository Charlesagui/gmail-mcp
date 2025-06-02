@echo off
echo 🔄 Reemplazando credenciales con Desktop App...

echo 📂 Ubicación actual de credenciales:
echo    C:\Users\%USERNAME%\.secure-gmail-mcp\credentials.json

echo.
echo 📝 INSTRUCCIONES:
echo 1. Descarga el archivo JSON desde Google Cloud Console
echo 2. Copia la ruta completa del archivo descargado
echo 3. Ejecuta este comando reemplazando la ruta:
echo.
echo    copy "C:\Users\%USERNAME%\Downloads\client_secret_XXXXX.json" "C:\Users\%USERNAME%\.secure-gmail-mcp\credentials.json"
echo.
echo 4. Luego ejecuta: npm run get-auth-url
echo.

pause

pause
