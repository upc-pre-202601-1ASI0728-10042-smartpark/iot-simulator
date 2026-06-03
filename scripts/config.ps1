# ============================================================================
# config.ps1  —  Carga .env a variables de entorno del proceso.
# Se "dot-sourcea" desde los demas scripts:  . "$PSScriptRoot\config.ps1"
# ============================================================================
$ErrorActionPreference = 'Stop'

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
if (-not (Test-Path $envPath)) {
    throw "No existe .env. Copia .env.example a .env y completa los valores. Ruta esperada: $envPath"
}

Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
        $idx = $line.IndexOf('=')
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        if ($key) { Set-Item -Path "Env:$key" -Value $val }
    }
}

# Validacion minima
foreach ($k in @('LOCATION', 'RESOURCE_GROUP', 'ADT_INSTANCE_NAME', 'STORAGE_ACCOUNT', 'STORAGE_CONTAINER')) {
    if (-not (Get-Item "Env:$k" -ErrorAction SilentlyContinue).Value) {
        throw "Falta la variable '$k' en .env"
    }
}

function Get-CurrentUserObjectId {
    return (az ad signed-in-user show --query id -o tsv)
}

Write-Host "Config cargada desde .env (RG=$($env:RESOURCE_GROUP), ADT=$($env:ADT_INSTANCE_NAME), Region=$($env:LOCATION))" -ForegroundColor Cyan
