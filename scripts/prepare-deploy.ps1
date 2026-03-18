param(
  [Parameter(Mandatory = $true)]
  [string] $ProjectId,

  [string] $StorageBucket,

  [string] $BackendName = "recordingxx",

  [string] $AppBaseUrl = "https://REPLACE_AFTER_BACKEND_CREATE",

  [string] $RateLimitSalt,

  [switch] $RunChecks,

  [switch] $InitGit
)

$ErrorActionPreference = "Stop"

function New-RandomSalt {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).Replace("+", "").Replace("/", "").Replace("=", "")
}

function Write-EnvFile {
  param(
    [string] $Path,
    [System.Collections.Specialized.OrderedDictionary] $Values
  )

  $lines = @()
  foreach ($key in $Values.Keys) {
    $lines += "$key=$($Values[$key])"
  }

  Set-Content -Path $Path -Value ($lines -join "`r`n") -NoNewline
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not $StorageBucket) {
  $StorageBucket = "$ProjectId-recordingxx-audio"
}

if (-not $RateLimitSalt) {
  $RateLimitSalt = New-RandomSalt
}

$envValues = [ordered]@{
  FIREBASE_PROJECT_ID = $ProjectId
  FIREBASE_STORAGE_BUCKET = $StorageBucket
  FIREBASE_DATABASE_ID = "(default)"
  APP_BASE_URL = $AppBaseUrl
  UPLOAD_MAX_BYTES = "104857600"
  UPLOAD_MAX_MINUTES = "90"
  RATE_LIMIT_WINDOW_MS = "900000"
  RATE_LIMIT_MAX_REQUESTS = "10"
  RATE_LIMIT_MAX_ACTIVE_JOBS = "2"
  PROCESSING_LEASE_MS = "600000"
  PROCESSING_HEARTBEAT_MS = "60000"
  RATE_LIMIT_SALT = $RateLimitSalt
}

Write-EnvFile -Path (Join-Path $root ".env.local") -Values $envValues

$firebaserc = @{
  projects = @{
    default = $ProjectId
  }
} | ConvertTo-Json -Depth 4
Set-Content -Path (Join-Path $root ".firebaserc") -Value $firebaserc

$appHostingYaml = @"
runConfig:
  maxInstances: 3
  minInstances: 0
  concurrency: 10

env:
  - variable: FIREBASE_PROJECT_ID
    value: $ProjectId
  - variable: FIREBASE_STORAGE_BUCKET
    value: $StorageBucket
  - variable: FIREBASE_DATABASE_ID
    value: (default)
  - variable: APP_BASE_URL
    value: $AppBaseUrl
  - variable: RATE_LIMIT_SALT
    value: $RateLimitSalt
  - variable: PROCESSING_LEASE_MS
    value: "600000"
  - variable: PROCESSING_HEARTBEAT_MS
    value: "60000"
"@

Set-Content -Path (Join-Path $root "apphosting.yaml") -Value $appHostingYaml -NoNewline

if ($InitGit) {
  if (-not (Test-Path (Join-Path $root ".git"))) {
    git init | Out-Null
    git branch -M main | Out-Null
  }
}

if ($RunChecks) {
  npm run lint
  if ($LASTEXITCODE -ne 0) {
    throw "lint failed"
  }

  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "build failed"
  }
}

Write-Host ""
Write-Host "Prepared deployment files:"
Write-Host "  - .env.local"
Write-Host "  - .firebaserc"
Write-Host "  - apphosting.yaml"
Write-Host ""
Write-Host "ProjectId      : $ProjectId"
Write-Host "StorageBucket  : $StorageBucket"
Write-Host "BackendName    : $BackendName"
Write-Host "AppBaseUrl     : $AppBaseUrl"
Write-Host ""
Write-Host "Note:"
Write-Host "  Create the Cloud Storage bucket '$StorageBucket' in the same project before uploading audio."
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Run: .\scripts\firebase.ps1 login"
Write-Host "  2. Run: .\scripts\create-backend.ps1 -ProjectId $ProjectId -BackendName $BackendName"
Write-Host "  3. After Firebase gives you the final hosted URL, run:"
Write-Host "     .\scripts\set-app-base-url.ps1 -AppBaseUrl <YOUR_HOSTED_URL>"
