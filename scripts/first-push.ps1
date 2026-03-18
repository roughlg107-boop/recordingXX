param(
  [Parameter(Mandatory = $true)]
  [string] $RemoteUrl,

  [string] $Branch = "main",

  [string] $CommitMessage = "Initial RecordingXX deployment setup"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Test-Path (Join-Path $root ".git"))) {
  git init
  git branch -M $Branch
}

git add .

$status = git status --short
if (-not [string]::IsNullOrWhiteSpace($status)) {
  git commit -m $CommitMessage
}

$remoteList = git remote
if ($remoteList -notcontains "origin") {
  git remote add origin $RemoteUrl
}

git push -u origin $Branch
