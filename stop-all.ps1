# ════════════════════════════════════════════════════════════
# stop-all.ps1
# Detiene todos los servicios del sistema
# ════════════════════════════════════════════════════════════

Write-Host "Deteniendo servicios..." -ForegroundColor Yellow

# ── Detener Redis ───────────────────────────────────────────
wsl -e sudo service redis-server stop
Write-Host "  Redis detenido" -ForegroundColor Green

# ── Apagar WSL2 para liberar memoria ────────────────────────
wsl --shutdown
Write-Host "  WSL2 apagado" -ForegroundColor Green

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*residuos_urbanos*" } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Write-Host "  Backend detenido" -ForegroundColor Green

# ── Detener solo el Python del microservicio ────────────────
Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -like "*ai-service*" -or $_.CommandLine -like "*uvicorn*" } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Write-Host "  Microservicio IA detenido" -ForegroundColor Green

Write-Host ""
Write-Host "Todos los servicios detenidos." -ForegroundColor Cyan
Start-Sleep -Seconds 2