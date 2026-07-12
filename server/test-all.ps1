$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3001'
$pass = 0; $fail = 0
function Check($name, $cond, $detail = '') {
  if ($cond) { $script:pass++; Write-Host "  [PASS] $name" }
  else { $script:fail++; Write-Host "  [FAIL] $name  $detail" }
}

Write-Host "=== 1. HEALTH ==="
$h = Invoke-RestMethod "$base/api/health"
Check 'health.ok=true' ($h.ok -eq $true)

Write-Host "=== 2. LOGIN (me) ==="
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body '{"userId":"me"}'
$token = $login.token
Check 'login returns token' ($token -and $token.Length -gt 0) "token=$token"
Check 'login returns user id=me' ($login.user.id -eq 'me')

Write-Host "=== 3. ERROR login: missing userId (400) ==="
try { Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body '{}' | Out-Null; Check 'missing userId should 400' $false }
catch { Check 'missing userId should 400' ($_.Exception.Response.StatusCode.value__ -eq 400) }

Write-Host "=== 4. ERROR login: unknown user (404) ==="
try { Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body '{"userId":"ghost"}' | Out-Null; Check 'unknown user should 404' $false }
catch { Check 'unknown user should 404' ($_.Exception.Response.StatusCode.value__ -eq 404) }

Write-Host "=== 5. AUTH/ME ==="
$me = Invoke-RestMethod "$base/api/auth/me" -Headers @{Authorization="Bearer $token"}
Check 'me returns logged-in user' ($me.user.id -eq 'me')

Write-Host "=== 6. NO token should 401 ==="
try { Invoke-RestMethod "$base/api/posts" | Out-Null; Check 'no token should 401' $false }
catch { Check 'no token should 401' ($_.Exception.Response.StatusCode.value__ -eq 401) }

Write-Host "=== 7. CREATE text post ==="
$textPost = Invoke-RestMethod "$base/api/posts" -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body '{"content":"Hello from test"}'
$tid = $textPost.post.id
Check 'create text post ok' ($tid -and $textPost.post.content -eq 'Hello from test')

Write-Host "=== 8. CREATE empty post (400) ==="
try { Invoke-RestMethod "$base/api/posts" -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body '{"content":"   "}' | Out-Null; Check 'empty content should 400' $false }
catch { Check 'empty content should 400' ($_.Exception.Response.StatusCode.value__ -eq 400) }

Write-Host "=== 9. UPLOAD image + create image post ==="
$b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
$bytes = [System.Convert]::FromBase64String($b64)
$imgPath = "$env:TEMP\test-upload.png"
[System.IO.File]::WriteAllBytes($imgPath, $bytes)
$upRaw = curl.exe -s -X POST "$base/api/upload" -H "Authorization: Bearer $token" -F "file=@$imgPath"
$up = $upRaw | ConvertFrom-Json
Check 'upload returns url' ($up.url -and $up.url.StartsWith('/uploads/')) "url=$($up.url)"
$imgBody = @{ content = "post with image"; images = @($up.url) } | ConvertTo-Json -Compress
$imgPost = Invoke-RestMethod "$base/api/posts" -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body $imgBody
$postId = $imgPost.post.id
Check 'image post images count=1' ($imgPost.post.images.Count -eq 1)

Write-Host "=== 10. SERVE uploaded file ==="
Invoke-RestMethod "$base$($up.url)" -Headers @{Accept='image/png'} -OutFile "$env:TEMP\returned.png" -PassThru | Out-Null
Check 'uploaded file is reachable' (Test-Path "$env:TEMP\returned.png")

Write-Host "=== 11. LIST posts ==="
$list = Invoke-RestMethod "$base/api/posts" -Headers @{Authorization="Bearer $token"}
$all = $list.posts
Check 'list has both new posts' (($all | Where-Object {$_.id -eq $tid}) -and ($all | Where-Object {$_.id -eq $postId}))

Write-Host "=== 12. LIKE / UNLIKE toggle ==="
$l1 = Invoke-RestMethod "$base/api/posts/$postId/like" -Method Post -Headers @{Authorization="Bearer $token"}
Check 'like -> liked=true' ($l1.liked -eq $true)
Check 'likeCount=1' ($l1.likeCount -eq 1)
$l2 = Invoke-RestMethod "$base/api/posts/$postId/like" -Method Post -Headers @{Authorization="Bearer $token"}
Check 'unlike -> liked=false' ($l2.liked -eq $false)
Check 'likeCount=0' ($l2.likeCount -eq 0)

Write-Host "=== 13. LIKE nonexistent post (404) ==="
try { Invoke-RestMethod "$base/api/posts/nope/like" -Method Post -Headers @{Authorization="Bearer $token"} | Out-Null; Check 'like missing post should 404' $false }
catch { Check 'like missing post should 404' ($_.Exception.Response.StatusCode.value__ -eq 404) }

Write-Host "=== 14. COMMENT + list echo + delete comment ==="
$cm = Invoke-RestMethod "$base/api/posts/$postId/comments" -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body '{"content":"Nice pic"}'
$cid = $cm.comment.id
Check 'comment ok' ($cm.comment.content -eq 'Nice pic')
$relist = Invoke-RestMethod "$base/api/posts" -Headers @{Authorization="Bearer $token"}
$p2 = $relist.posts | Where-Object {$_.id -eq $postId}
Check 'comment echoed in list' (($p2.comments | Where-Object {$_.id -eq $cid}) -and $p2.comments[0].profiles.display_name)
Invoke-RestMethod "$base/api/posts/comments/$cid" -Method Delete -Headers @{Authorization="Bearer $token"} | Out-Null
$relist2 = Invoke-RestMethod "$base/api/posts" -Headers @{Authorization="Bearer $token"}
$p3 = $relist2.posts | Where-Object {$_.id -eq $postId}
Check 'comment deleted' (-not ($p3.comments | Where-Object {$_.id -eq $cid}))

Write-Host "=== 15. EMPTY comment (400) ==="
try { Invoke-RestMethod "$base/api/posts/$postId/comments" -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body '{"content":""}' | Out-Null; Check 'empty comment should 400' $false }
catch { Check 'empty comment should 400' ($_.Exception.Response.StatusCode.value__ -eq 400) }

Write-Host "=== 16. SECOND user + authorization ==="
$login2 = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body '{"userId":"wife"}'
$token2 = $login2.token
Check 'wife login ok' ($login2.user.id -eq 'wife')
try { Invoke-RestMethod "$base/api/posts/$postId" -Method Delete -Headers @{Authorization="Bearer $token2"} | Out-Null; Check 'cannot delete others post should 403' $false }
catch { Check 'cannot delete others post should 403' ($_.Exception.Response.StatusCode.value__ -eq 403) }

Write-Host "=== 17. DELETE own posts ==="
Invoke-RestMethod "$base/api/posts/$tid" -Method Delete -Headers @{Authorization="Bearer $token"} | Out-Null
Invoke-RestMethod "$base/api/posts/$postId" -Method Delete -Headers @{Authorization="Bearer $token"} | Out-Null
$final = Invoke-RestMethod "$base/api/posts" -Headers @{Authorization="Bearer $token"}
Check 'both posts deleted' (-not (($final.posts | Where-Object {$_.id -eq $tid}) -or ($final.posts | Where-Object {$_.id -eq $postId})))

Write-Host "=== 18. LOGOUT invalidates token ==="
Invoke-RestMethod "$base/api/auth/logout" -Method Post -Headers @{Authorization="Bearer $token"} | Out-Null
try { Invoke-RestMethod "$base/api/auth/me" -Headers @{Authorization="Bearer $token"} | Out-Null; Check 'token invalid after logout should 401' $false }
catch { Check 'token invalid after logout should 401' ($_.Exception.Response.StatusCode.value__ -eq 401) }

Write-Host "=== 19. FRONTEND proxy (5173 -> 3001) ==="
$ph = Invoke-RestMethod "http://localhost:5173/api/health"
Check 'vite proxy health ok' ($ph.ok -eq $true)

Write-Host ""
Write-Host "========== RESULT =========="
Write-Host "PASS: $pass   FAIL: $fail"
if ($fail -gt 0) { exit 1 }
