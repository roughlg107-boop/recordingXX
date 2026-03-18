param(
  [Parameter(Mandatory = $true)]
  [string] $ProjectId,

  [string] $BackendName = "recordingxx",

  [string] $Region = "asia-east1",

  [string] $RootDir = "."
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Starting Firebase App Hosting backend creation..."
Write-Host "Project: $ProjectId"
Write-Host "Backend: $BackendName"
Write-Host "Region : $Region"
Write-Host ""
Write-Host "Firebase may still ask you to choose or create the linked Web App / GitHub repository."
Write-Host ""

& (Join-Path $PSScriptRoot "firebase.ps1") `
  "--project" $ProjectId `
  "apphosting:backends:create" `
  "--backend" $BackendName `
  "--primary-region" $Region `
  "--root-dir" $RootDir

exit $LASTEXITCODE
