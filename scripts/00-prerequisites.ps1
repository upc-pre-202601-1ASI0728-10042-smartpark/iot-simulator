# ============================================================================
# 00-prerequisites.ps1  —  Verifica e instala lo necesario.
#   - Azure CLI + extension azure-iot/digitaltwins
#   - Node.js
#   - Login en Azure
# Ejecutar:  ./scripts/00-prerequisites.ps1
# ============================================================================
. "$PSScriptRoot\config.ps1"

Write-Host "`n[1/5] Azure CLI..." -ForegroundColor Yellow
$az = (Get-Command az -ErrorAction SilentlyContinue)
if (-not $az) { throw "Azure CLI no instalado. Descarga: https://aka.ms/installazurecliwindows" }
az version --output table

Write-Host "`n[2/5] Extension de Azure Digital Twins..." -ForegroundColor Yellow
az extension add --name azure-iot --upgrade --only-show-errors
Write-Host "  OK" -ForegroundColor Green

Write-Host "`n[3/5] Node.js..." -ForegroundColor Yellow
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw "Node.js no instalado. Descarga: https://nodejs.org (LTS)" }
node --version

Write-Host "`n[4/5] Login en Azure..." -ForegroundColor Yellow
$acct = (az account show --query name -o tsv 2>$null)
if (-not $acct) {
    Write-Host "  No hay sesion. Ejecuta en tu terminal:  az login" -ForegroundColor Red
    Write-Host "  (tip: en Claude Code puedes escribir  ! az login  para que corra en la sesion)" -ForegroundColor DarkGray
    throw "Inicia sesion con 'az login' y vuelve a ejecutar."
}
if ($env:AZURE_SUBSCRIPTION_ID) { az account set --subscription $env:AZURE_SUBSCRIPTION_ID }
Write-Host "  Suscripcion activa: $(az account show --query name -o tsv)" -ForegroundColor Green

Write-Host "`n[5/5] Dependencias de Node (npm install)..." -ForegroundColor Yellow
Push-Location (Split-Path $PSScriptRoot -Parent)
npm install --no-fund --no-audit
Pop-Location

Write-Host "`nPrerequisitos OK. Siguiente:  ./scripts/01-provision-azure.ps1" -ForegroundColor Green
