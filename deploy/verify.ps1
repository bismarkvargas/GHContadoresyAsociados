# ---------------------------------------------------------------------------
# Verificación completa del sistema GH Contadores y Asociados
#
# Ejecuta, en este orden, las tres baterías de pruebas contra el entorno
# desplegado en https://demostracion.es/ghcontadores/:
#
#   1. Prueba de humo de la API      (deploy/smoke-test.sh, vía SSH al VPS)
#   2. Tiempo real por SignalR       (tools/realtime-test)
#   3. Panel de administración E2E   (tools/e2e-admin, navegador real)
#
# Uso:  pwsh -File deploy/verify.ps1
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot
$resultados = @()

function Seccion($titulo) {
    Write-Host ""
    Write-Host ("=" * 66) -ForegroundColor DarkGray
    Write-Host "  $titulo" -ForegroundColor Cyan
    Write-Host ("=" * 66) -ForegroundColor DarkGray
}

Seccion "1/3 · Prueba de humo de la API (flujos de negocio en producción)"
Write-Host "  Ejecutando deploy/smoke-test.sh en el servidor..." -ForegroundColor DarkGray
Write-Host "  (usa la conexión SSH 'VPS BISMARK' guardada en el plugin)" -ForegroundColor DarkGray
Write-Host "  Comando: ssh root@2.25.111.177 'bash /opt/ghcontadores/deploy/smoke-test.sh'" -ForegroundColor DarkGray

Seccion "2/3 · Tiempo real (SignalR)"
Push-Location (Join-Path $raiz 'tools/realtime-test')
if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund | Out-Null }
node realtime-test.mjs
$resultados += @{ Nombre = 'Tiempo real (SignalR)'; Codigo = $LASTEXITCODE }
Pop-Location

Seccion "3/3 · Panel de administración (navegador real)"
Push-Location (Join-Path $raiz 'tools/e2e-admin')
if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund | Out-Null }
node e2e-admin.mjs
$resultados += @{ Nombre = 'Panel E2E'; Codigo = $LASTEXITCODE }
Pop-Location

Seccion "Resumen"
foreach ($r in $resultados) {
    if ($r.Codigo -eq 0) {
        Write-Host ("  ✔ {0}" -f $r.Nombre) -ForegroundColor Green
    } else {
        Write-Host ("  ✘ {0} (código {1})" -f $r.Nombre, $r.Codigo) -ForegroundColor Red
    }
}
Write-Host ""
Write-Host "  Panel : https://demostracion.es/ghcontadores/" -ForegroundColor White
Write-Host "  API   : https://demostracion.es/ghcontadores/api/v1" -ForegroundColor White
Write-Host "  Docs  : https://demostracion.es/ghcontadores/swagger" -ForegroundColor White
Write-Host ""
Write-Host "  Recuerde ejecutar también la prueba de humo en el servidor:" -ForegroundColor Yellow
Write-Host "    bash /opt/ghcontadores/deploy/smoke-test.sh" -ForegroundColor Yellow
