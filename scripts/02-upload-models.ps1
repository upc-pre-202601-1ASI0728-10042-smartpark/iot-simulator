# ============================================================================
# 02-upload-models.ps1  —  Sube la ontologia DTDL (9 modelos) a Azure Digital Twins.
#   Orden importa por dependencias entre modelos -> se suben todos juntos en un lote.
# Ejecutar:  ./scripts/02-upload-models.ps1
# ============================================================================
. "$PSScriptRoot\config.ps1"

$adt = $env:ADT_INSTANCE_NAME
$ontologyDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'ontology'

Write-Host "`nSubiendo modelos DTDL desde $ontologyDir ..." -ForegroundColor Yellow

# Subir como lote resuelve dependencias entre interfaces (relationships/targets).
$files = Get-ChildItem -Path $ontologyDir -Filter *.json | ForEach-Object { $_.FullName }
$fromArgs = @()
foreach ($f in $files) { $fromArgs += @('--models', $f) }

# Si ya existen, az falla; primero intentamos crear, y si falla mostramos los existentes.
try {
    az dt model create --dt-name $adt @fromArgs --only-show-errors | Out-Null
    Write-Host "  Modelos subidos: $($files.Count)" -ForegroundColor Green
} catch {
    Write-Host "  Algunos modelos ya existian. Estado actual:" -ForegroundColor DarkYellow
}

Write-Host "`nModelos en la instancia:" -ForegroundColor Cyan
az dt model list --dt-name $adt --query "[].id" -o tsv

Write-Host "`nSiguiente:  npm run seed   (siembra el grafo de 56 twins)" -ForegroundColor Green
