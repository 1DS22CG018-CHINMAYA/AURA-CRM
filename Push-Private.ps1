param (
    [string]$RemoteUrl = ""
)

if ($RemoteUrl -eq "") {
    Write-Host "Please provide your Private Git repository URL." -ForegroundColor Yellow
    Write-Host "Example: .\Push-Private.ps1 https://github.com/YourUser/Aura-CRM-Private.git" -ForegroundColor Cyan
    exit
}

Write-Host "Starting Private Backup process..." -ForegroundColor Green

$PrivateGitDir = ".git-private"

if (!(Test-Path $PrivateGitDir)) {
    Write-Host "Initializing private git structure..." -ForegroundColor Cyan
    git --git-dir=$PrivateGitDir --work-tree=. init
    git --git-dir=$PrivateGitDir --work-tree=. remote add origin $RemoteUrl
    
    # Ensure branch
    git --git-dir=$PrivateGitDir --work-tree=. checkout -b main 2>$null
}
else {
    git --git-dir=$PrivateGitDir --work-tree=. remote set-url origin $RemoteUrl
}

Write-Host "Temporarily disabling .gitignore rules across the project..." -ForegroundColor Yellow
# Find and rename ALL .gitignore files so that Git can see modules & env configs
$Gitignores = Get-ChildItem -Path . -Recurse -Filter ".gitignore" -Force | Where-Object { 
    $_.FullName -notmatch '\\node_modules\\' -and 
    $_.FullName -notmatch '\\\.venv\\' -and 
    $_.FullName -notmatch '\\\.git\\' -and 
    $_.FullName -notmatch '\\\.git-private\\' 
}

foreach ($file in $Gitignores) {
    Rename-Item $file.FullName ($file.Name + ".bak") -Force
}

# 2. Create a TEMPORARY .gitignore ONLY to stop Git from committing itself
Set-Content -Path ".gitignore" -Value @"
.git/
.git-private/
*.bak
Push-Private.ps1
git-private.cmd
"@

Write-Host "Staging all hidden and ignored files..." -ForegroundColor Cyan
git --git-dir=$PrivateGitDir --work-tree=. add .

# 3. Restore all original .gitignore files
Write-Host "Restoring normal Git configurations..." -ForegroundColor Yellow
Remove-Item ".gitignore" -Force
$GitignoresBak = Get-ChildItem -Path . -Recurse -Filter ".gitignore.bak" -Force
foreach ($file in $GitignoresBak) {
    Rename-Item $file.FullName ".gitignore" -Force
}

Write-Host "Committing entire project..." -ForegroundColor Cyan
$Date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git --git-dir=$PrivateGitDir --work-tree=. commit -m "Complete Backup - $Date"

Write-Host "Pushing to $RemoteUrl..." -ForegroundColor Cyan
git --git-dir=$PrivateGitDir --work-tree=. push origin main --force

Write-Host "==================================" -ForegroundColor Green
Write-Host " Private repository push complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
