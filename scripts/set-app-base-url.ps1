param(
  [Parameter(Mandatory = $true)]
  [string] $AppBaseUrl
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$envPath = Join-Path $root ".env.local"
$yamlPath = Join-Path $root "apphosting.yaml"

if (-not (Test-Path $envPath)) {
  throw ".env.local not found. Run .\scripts\prepare-deploy.ps1 first."
}

if (-not (Test-Path $yamlPath)) {
  throw "apphosting.yaml not found."
}

$envContent = Get-Content $envPath -Raw
$envContent = [regex]::Replace(
  $envContent,
  "(?m)^APP_BASE_URL=.*$",
  "APP_BASE_URL=$AppBaseUrl"
)
Set-Content -Path $envPath -Value $envContent -NoNewline

$yamlContent = Get-Content $yamlPath -Raw
$yamlContent = [regex]::Replace(
  $yamlContent,
  "(?m)^  - variable: APP_BASE_URL\r?\n    value: .*$",
  "  - variable: APP_BASE_URL`r`n    value: $AppBaseUrl"
)
Set-Content -Path $yamlPath -Value $yamlContent -NoNewline

Write-Host "Updated APP_BASE_URL in .env.local and apphosting.yaml"
