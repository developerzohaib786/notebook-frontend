# Deploy Frontend to GitHub
Write-Host "`n========== FRONTEND DEPLOYMENT ==========" -ForegroundColor Cyan

# Navigate to frontend directory
Set-Location "e:\personal projects\rag-chat-app\client\nextvia"

Write-Host "`n1. Committing changes to Git..." -ForegroundColor Yellow
git add .
git commit -m "Update: Point to localhost for development, configurable API_BASE"

Write-Host "`n2. Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "`n✅ Frontend pushed to GitHub" -ForegroundColor Green
Write-Host "`nIf deploying to Vercel/Netlify, make sure to set:" -ForegroundColor Yellow
Write-Host "  NEXT_PUBLIC_API_BASE=https://your-heroku-app.herokuapp.com" -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Cyan
