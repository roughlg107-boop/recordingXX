param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $FirebaseArgs
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$configDir = Join-Path $root ".firebase-config"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

$env:XDG_CONFIG_HOME = $configDir

& firebase @FirebaseArgs
exit $LASTEXITCODE
