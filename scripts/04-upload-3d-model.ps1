# ============================================================================
# 04-upload-3d-model.ps1  —  Sube el modelo 3D y la config de escena al storage.
#   1. Regenera parking-garage.glb y 3DScenesConfiguration.json (con la URL real)
#   2. Sube ambos al contenedor de blobs
#   3. Imprime la URL lista para abrir 3D Scenes Studio
# Ejecutar:  ./scripts/04-upload-3d-model.ps1
# ============================================================================
. "$PSScriptRoot\config.ps1"

$sa = $env:STORAGE_ACCOUNT
$container = $env:STORAGE_CONTAINER
$root = Split-Path $PSScriptRoot -Parent
$glb = Join-Path $root 'model3d\parking-garage.glb'
$cfg = Join-Path $root 'model3d\3DScenesConfiguration.json'

Write-Host "`n[1/3] Regenerando modelo 3D y config (con STORAGE_ACCOUNT=$sa)..." -ForegroundColor Yellow
Push-Location $root
node model3d/generate-garage-glb.mjs
node model3d/generate-scenes-config.mjs   # toma STORAGE_ACCOUNT/CONTAINER del entorno -> URL real
Pop-Location

Write-Host "`n[2/3] Subiendo blobs a '$container'..." -ForegroundColor Yellow
az storage blob upload --account-name $sa --container-name $container --auth-mode login `
  --name 'parking-garage.glb' --file $glb --content-type 'model/gltf-binary' --overwrite --only-show-errors | Out-Null
az storage blob upload --account-name $sa --container-name $container --auth-mode login `
  --name '3DScenesConfiguration.json' --file $cfg --content-type 'application/json' --overwrite --only-show-errors | Out-Null
Write-Host "  Subidos: parking-garage.glb, 3DScenesConfiguration.json" -ForegroundColor Green

$adtHost = $env:ADT_HOST_NAME
$storageContainerUrl = "https://$sa.blob.core.windows.net/$container"
Write-Host "`n[3/3] LISTO. Abre 3D Scenes Studio en el navegador:" -ForegroundColor Cyan
Write-Host "https://explorer.digitaltwins.azure.net/3dscenes/?adtUrl=https://$adtHost`&storageContainerUrl=$storageContainerUrl" -ForegroundColor White
Write-Host "`nLa escena 'SmartPark - Jockey Plaza' ya aparece mapeada y coloreada." -ForegroundColor Green
Write-Host "Inicia el simulador para ver el 3D cambiar en vivo:  npm run simulate" -ForegroundColor Green
