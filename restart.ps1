$env:NODE_ENV = "development"

# Clear Next.js cache to avoid stale HMR manifests
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Write-Host "Cache cleared." -ForegroundColor Green

# Get this machine's LAN IP (first non-loopback IPv4)
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1).IPAddress

if (-not $lanIp) { $lanIp = "localhost" }

Write-Host "Starting dev server on http://${lanIp}:3000  and  http://localhost:3000" -ForegroundColor Cyan
Write-Host "(HMR WebSocket will use the same host you visit)" -ForegroundColor DarkGray

# -H 0.0.0.0  -> listen on all interfaces so LAN devices can connect
# -p 3000     -> port
npm run dev -- -H 0.0.0.0 -p 3000
