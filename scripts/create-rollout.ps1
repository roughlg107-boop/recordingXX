param(
  [Parameter(Mandatory = $true)]
  [string] $ProjectId,

  [Parameter(Mandatory = $true)]
  [string] $BackendName,

  [string] $Branch = "main"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

& (Join-Path $PSScriptRoot "firebase.ps1") `
  "--project" $ProjectId `
  "apphosting:rollouts:create" `
  $BackendName `
  "--git-branch" $Branch `
  "--force"

exit $LASTEXITCODE
