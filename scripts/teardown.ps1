# ============================================================================
# teardown.ps1  —  Borra TODO para no gastar credito de Azure.
#   Elimina el Resource Group completo (ADT + Storage + roles).
# Ejecutar:  ./scripts/teardown.ps1
# ============================================================================
. "$PSScriptRoot\config.ps1"

$rg = $env:RESOURCE_GROUP
Write-Host "Esto ELIMINA el resource group '$rg' y todo su contenido." -ForegroundColor Red
$confirm = Read-Host "Escribe el nombre del RG para confirmar"
if ($confirm -ne $rg) { Write-Host "Cancelado." -ForegroundColor Yellow; exit }

az group delete --name $rg --yes --no-wait
Write-Host "Borrado en curso (--no-wait). Verifica con: az group list -o table" -ForegroundColor Green
