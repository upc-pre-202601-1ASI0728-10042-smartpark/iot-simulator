# ============================================================================
# 01-provision-azure.ps1  —  Crea TODA la infraestructura en Azure.
#   - Resource Group
#   - Instancia de Azure Digital Twins  + rol "Azure Digital Twins Data Owner"
#   - Storage Account + contenedor de blobs  + rol "Storage Blob Data Owner"
#   - CORS en el storage para 3D Scenes Studio
#   - Escribe ADT_HOST_NAME de vuelta en .env
# Ejecutar:  ./scripts/01-provision-azure.ps1
# ============================================================================
. "$PSScriptRoot\config.ps1"

$rg = $env:RESOURCE_GROUP
$loc = $env:LOCATION
$adt = $env:ADT_INSTANCE_NAME
$sa = $env:STORAGE_ACCOUNT
$container = $env:STORAGE_CONTAINER
$me = Get-CurrentUserObjectId

Write-Host "`n[1/8] Resource Group '$rg' en '$loc'..." -ForegroundColor Yellow
az group create --name $rg --location $loc --only-show-errors | Out-Null

Write-Host "[2/8] Instancia de Azure Digital Twins '$adt'..." -ForegroundColor Yellow
az dt create --dt-name $adt --resource-group $rg --location $loc --only-show-errors | Out-Null
$adtHost = az dt show --dt-name $adt --resource-group $rg --query 'hostName' -o tsv
Write-Host "  hostName: $adtHost" -ForegroundColor Green

Write-Host "[3/8] Rol 'Azure Digital Twins Data Owner' para ti..." -ForegroundColor Yellow
$adtId = az dt show --dt-name $adt --resource-group $rg --query 'id' -o tsv
az role assignment create --assignee $me --role "Azure Digital Twins Data Owner" --scope $adtId --only-show-errors | Out-Null
Write-Host "  OK" -ForegroundColor Green

Write-Host "[4/8] Storage Account '$sa'..." -ForegroundColor Yellow
az storage account create --name $sa --resource-group $rg --location $loc --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false --only-show-errors | Out-Null

Write-Host "[5/8] Rol 'Storage Blob Data Owner' para ti..." -ForegroundColor Yellow
$saId = az storage account show --name $sa --resource-group $rg --query 'id' -o tsv
az role assignment create --assignee $me --role "Storage Blob Data Owner" --scope $saId --only-show-errors | Out-Null
Write-Host "  OK (puede tardar ~1 min en propagarse)" -ForegroundColor Green

Write-Host "[6/8] Contenedor de blobs '$container'..." -ForegroundColor Yellow
az storage container create --name $container --account-name $sa --auth-mode login --only-show-errors | Out-Null

Write-Host "[7/8] CORS para 3D Scenes Studio..." -ForegroundColor Yellow
az storage cors clear --account-name $sa --services b --only-show-errors
az storage cors add --account-name $sa --services b `
  --methods GET POST PUT OPTIONS PATCH MERGE DELETE `
  --origins "https://explorer.digitaltwins.azure.net" `
  --allowed-headers "*" --exposed-headers "*" --max-age 3600 --only-show-errors
Write-Host "  OK" -ForegroundColor Green

Write-Host "[8/8] Guardando ADT_HOST_NAME en .env..." -ForegroundColor Yellow
$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
$content = Get-Content $envPath
if ($content -match '^ADT_HOST_NAME=') {
    $content = $content -replace '^ADT_HOST_NAME=.*', "ADT_HOST_NAME=$adtHost"
} else {
    $content += "ADT_HOST_NAME=$adtHost"
}
Set-Content -Path $envPath -Value $content -Encoding utf8
Write-Host "  ADT_HOST_NAME=$adtHost" -ForegroundColor Green

$storageContainerUrl = "https://$sa.blob.core.windows.net/$container"
Write-Host "`n=================== PROVISION COMPLETA ===================" -ForegroundColor Cyan
Write-Host "ADT host          : $adtHost"
Write-Host "Storage container : $storageContainerUrl"
Write-Host "`nURL lista para 3D Scenes Studio (guardala):" -ForegroundColor Cyan
Write-Host "https://explorer.digitaltwins.azure.net/3dscenes/?adtUrl=https://$adtHost`&storageContainerUrl=$storageContainerUrl" -ForegroundColor White
Write-Host "`nSiguiente:  ./scripts/02-upload-models.ps1" -ForegroundColor Green
