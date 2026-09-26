$envPath = @(".\backend\.env", ".env") | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $envPath) {
  Write-Host "Could not find .env - run this script from C:\Users\Whemz\learning-backend"
  exit 1
}

Write-Host "Using env file: $envPath"

$envVars = @{}
Get-Content $envPath | ForEach-Object {
  if ($_ -match "^\s*([^#=]+?)\s*=\s*(.*)$") {
    $envVars[$matches[1]] = $matches[2].Trim('"')
  }
}

if (-not $envVars['SPOTIFY_CLIENT_ID'] -or -not $envVars['SPOTIFY_CLIENT_SECRET']) {
  Write-Host "SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not found in $envPath"
  exit 1
}

$pair  = "$($envVars['SPOTIFY_CLIENT_ID']):$($envVars['SPOTIFY_CLIENT_SECRET'])"
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))

$tokenResponse = Invoke-RestMethod -Uri "https://accounts.spotify.com/api/token" `
  -Method Post `
  -Headers @{ Authorization = "Basic $basic" } `
  -Body @{ grant_type = "client_credentials" }

$token = $tokenResponse.access_token
Write-Host "Got token: $($token.Substring(0,10))..."

try {
  $result = Invoke-WebRequest -Uri "https://api.spotify.com/v1/tracks?ids=3n3Ppam7vgaVa1iaRUc9Lp" `
    -Headers @{ Authorization = "Bearer $token" }
  Write-Host "STATUS: $($result.StatusCode)"
  Write-Host $result.Content
} catch {
  Write-Host "STATUS: $($_.Exception.Response.StatusCode.value__)"
  Write-Host $_.ErrorDetails.Message
}