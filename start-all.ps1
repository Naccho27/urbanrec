# ============================================================
# start-all.ps1
# Levanta todos los servicios del sistema en terminales separadas
#
# Uso: .\start-all.ps1
# ============================================================

$ProjectRoot = $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " UrbanRec - Iniciando servicios" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Redis en WSL2 ---
Write-Host "[1/3] Iniciando Redis en WSL2..." -ForegroundColor Yellow

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host 'REDIS - WSL2 activo' -ForegroundColor Green; wsl -e sudo service redis-server start; wsl"
)

Start-Sleep -Seconds 3
Write-Host "      Redis iniciado en terminal separada" -ForegroundColor Green
Write-Host ""

# --- 2. Backend Node.js ---
Write-Host "[2/3] Iniciando backend Node.js..." -ForegroundColor Yellow

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$ProjectRoot\backend'; Write-Host 'BACKEND - http://localhost:3000' -ForegroundColor Green; npm run dev"
)

Write-Host "      Backend iniciado en terminal separada" -ForegroundColor Green
Write-Host ""

# --- 3. Microservicio IA Python ---
Write-Host "[3/3] Iniciando microservicio de IA..." -ForegroundColor Yellow

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$ProjectRoot\ai-service'; Write-Host 'AI SERVICE - http://localhost:8000' -ForegroundColor Green; .\venv\Scripts\Activate.ps1; python -m uvicorn main:app --reload --port 8000"
)

Write-Host "      Microservicio IA iniciado en terminal separada" -ForegroundColor Green
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Servicios activos:" -ForegroundColor Cyan
Write-Host "   Backend:     http://localhost:3000" -ForegroundColor White
Write-Host "   IA Service:  http://localhost:8000" -ForegroundColor White
Write-Host "   Redis:       localhost:6379 (WSL2)" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presione cualquier tecla para cerrar esta ventana..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")