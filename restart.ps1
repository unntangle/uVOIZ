$env:NODE_ENV = "development"
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Write-Host "Cache cleared. Starting dev server..."
npm run dev
