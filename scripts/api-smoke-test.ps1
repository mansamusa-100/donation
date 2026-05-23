# Critical API smoke test — BarakahFund backend
$Base = "http://localhost:4000"
$Results = [System.Collections.Generic.List[object]]::new()

function Test-Route {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Path,
    [int[]]$ExpectStatus = @(200),
    [hashtable]$Headers = @{},
    $Body = $null
  )
  $uri = "$Base$Path"
  $params = @{
    Uri             = $uri
    Method          = $Method
    UseBasicParsing = $true
    TimeoutSec      = 15
    ErrorAction     = 'Stop'
  }
  if ($Headers.Count -gt 0) { $params.Headers = $Headers }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }
  try {
    $resp = Invoke-WebRequest @params
    $status = [int]$resp.StatusCode
    $content = $resp.Content
    $ok = $ExpectStatus -contains $status
    $preview = if ($content.Length -gt 120) { $content.Substring(0, 120) + '…' } else { $content }
    [void]$Results.Add([pscustomobject]@{
        Route   = "$Method $Path"
        Name    = $Name
        Status  = $status
        OK      = $ok
        Preview = $preview
      })
    return @{ Ok = $ok; Status = $status; Content = $content }
  }
  catch {
    $status = 0
    $content = $_.Exception.Message
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode.value__
      try {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $content = $reader.ReadToEnd()
        $reader.Close()
      }
      catch { }
    }
    $ok = $ExpectStatus -contains $status
    $preview = if ($content.Length -gt 120) { $content.Substring(0, 120) + '…' } else { $content }
    [void]$Results.Add([pscustomobject]@{
        Route   = "$Method $Path"
        Name    = $Name
        Status  = $status
        OK      = $ok
        Preview = $preview
      })
    return @{ Ok = $ok; Status = $status; Content = $content }
  }
}

Write-Host "`n=== BarakahFund API Smoke Test ===`n" -ForegroundColor Cyan

# --- Public read routes ---
Test-Route -Name 'Health' -Method GET -Path '/api/health'
Test-Route -Name 'Platform stats' -Method GET -Path '/api/stats'
Test-Route -Name 'Categories' -Method GET -Path '/api/categories'
$list = Test-Route -Name 'List campaigns' -Method GET -Path '/api/campaigns'
Test-Route -Name 'List campaigns (filtered)' -Method GET -Path '/api/campaigns?sort=trending&category=Emergency'
$slug = 'rebuild-brikama-market-stalls'
Test-Route -Name 'Campaign by slug' -Method GET -Path "/api/campaigns/$slug"
Test-Route -Name 'Payment providers' -Method GET -Path '/api/payments/providers'

# --- Auth ---
$userLogin = Test-Route -Name 'User login' -Method POST -Path '/api/auth/login' -ExpectStatus @(200) -Body @{
  email    = 'user@barakahfund.com'
  password = 'user@123'
}
$adminLogin = Test-Route -Name 'Admin login' -Method POST -Path '/api/auth/login' -ExpectStatus @(200) -Body @{
  email    = 'admin@barakahfund.com'
  password = 'admin@123'
}

$userToken = $null
$adminToken = $null
if ($userLogin.Content) {
  try { $userToken = (ConvertFrom-Json $userLogin.Content).token } catch { }
}
if ($adminLogin.Content) {
  try { $adminToken = (ConvertFrom-Json $adminLogin.Content).token } catch { }
}

if ($userToken) {
  Test-Route -Name 'Auth me (user)' -Method GET -Path '/api/auth/me' -Headers @{ Authorization = "Bearer $userToken" }
  Test-Route -Name 'My campaigns overview' -Method GET -Path '/api/campaigns/mine/overview' -Headers @{ Authorization = "Bearer $userToken" }
}

if ($adminToken) {
  Test-Route -Name 'Auth me (admin)' -Method GET -Path '/api/auth/me' -Headers @{ Authorization = "Bearer $adminToken" }
  Test-Route -Name 'Admin activity' -Method GET -Path '/api/admin/activity' -Headers @{ Authorization = "Bearer $adminToken" }
  Test-Route -Name 'Admin stats' -Method GET -Path '/api/admin/stats' -Headers @{ Authorization = "Bearer $adminToken" }
  Test-Route -Name 'Admin pending campaigns' -Method GET -Path '/api/admin/campaigns/pending' -Headers @{ Authorization = "Bearer $adminToken" }
  Test-Route -Name 'Admin all campaigns' -Method GET -Path '/api/admin/campaigns' -Headers @{ Authorization = "Bearer $adminToken" }
  Test-Route -Name 'Admin users' -Method GET -Path '/api/admin/users' -Headers @{ Authorization = "Bearer $adminToken" }
  Test-Route -Name 'Admin withdrawal requests' -Method GET -Path '/api/admin/withdrawal-requests' -Headers @{ Authorization = "Bearer $adminToken" }
}

# --- Donation (ledger write) ---
$donation = Test-Route -Name 'Create donation' -Method POST -Path "/api/campaigns/$slug/donations" -ExpectStatus @(201) -Body @{
  donorName         = 'API Smoke Tester'
  amount            = 100
  platformTipAmount = 0
  currency          = 'GMD'
  message           = 'Automated smoke test - safe to ignore'
  isAnonymous       = $false
}

# --- Auth edge cases (expected failures) ---
Test-Route -Name 'Login invalid creds' -Method POST -Path '/api/auth/login' -ExpectStatus @(401) -Body @{
  email    = 'user@barakahfund.com'
  password = 'wrong-password'
}
Test-Route -Name 'Auth me without token' -Method GET -Path '/api/auth/me' -ExpectStatus @(401)
Test-Route -Name 'Admin route without token' -Method GET -Path '/api/admin/stats' -ExpectStatus @(401)
Test-Route -Name 'Campaign not found' -Method GET -Path '/api/campaigns/nonexistent-slug-xyz' -ExpectStatus @(404)

# --- Payment session (expect 503 if Wave not configured, or 404/400 with bad slug) ---
$waveSession = Test-Route -Name 'Wave checkout session' -Method POST -Path '/api/payments/wave/session' -ExpectStatus @(200, 201, 400, 404, 503) -Body @{
  campaignSlug      = $slug
  amount            = 500
  platformTipAmount = 0
  currency          = 'GMD'
  donorName         = 'Smoke Tester'
  isAnonymous       = $false
}

# --- Forgot password (always 200) ---
Test-Route -Name 'Forgot password' -Method POST -Path '/api/auth/forgot-password' -ExpectStatus @(200) -Body @{
  email = 'user@barakahfund.com'
}

Write-Host "`n--- Results ---`n"
$pass = ($Results | Where-Object { $_.OK }).Count
$fail = ($Results | Where-Object { -not $_.OK }).Count
$Results | ForEach-Object {
  $icon = if ($_.OK) { '[PASS]' } else { '[FAIL]' }
  $color = if ($_.OK) { 'Green' } else { 'Red' }
  Write-Host "$icon $($_.Name) ($($_.Route)) -> $($_.Status)" -ForegroundColor $color
  if (-not $_.OK) { Write-Host "       $($_.Preview)" -ForegroundColor DarkGray }
}
Write-Host "`nTotal: $pass passed, $fail failed ($($Results.Count) checks)`n" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Yellow' })
if ($fail -gt 0) { exit 1 }
