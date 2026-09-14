$headers = @{
  'accept' = 'application/json, text/plain, */*'
  'accept-encoding' = 'gzip, deflate, br'
  'accept-language' = 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6'
  'authorization' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6Ind4X291MWVwMkdmbFBCYyIsImNsaWVudFR5cGUiOiJQQyIsInRlbmFudElkIjo4Nzk1LCJleHAiOjE3ODg0MzcxOTh9.F7h8gWY1OuBBNy3HdChGaKTya-9lTGD--GZkNtPnG9U'
  'dnt' = '1'
  'platform' = 'pc'
  'referer' = 'https://sw.aibaizhu.com/user'
  'sec-ch-ua' = '"Microsoft Edge";v="107", "Chromium";v="107", "Not=A?Brand";v="24"'
  'sec-ch-ua-mobile' = '?0'
  'sec-ch-ua-platform' = '"Windows"'
  'sec-fetch-dest' = 'empty'
  'sec-fetch-mode' = 'cors'
  'sec-fetch-site' = 'same-origin'
  'user-agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.24'
  'v-sign' = '53F5C5FF9BC64263FDD04E3DABA87948'
  'x-access-token' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6Ind4X291MWVwMkdmbFBCYyIsImNsaWVudFR5cGUiOiJQQyIsInRlbmFudElkIjo4Nzk1LCJleHAiOjE3ODg0MzcxOTh9.F7h8gWY1OuBBNy3HdChGaKTya-9lTGD--GZkNtPnG9U'
  'x-sign' = 'E19D6243CB1945AB4F7202A1B00F77D5'
  'x-timestamp' = '1788136403607'
}
try {
  $resp = Invoke-RestMethod -Uri 'https://sw.aibaizhu.com/api/sys/userAssetsAccount/getByUserId/2094215248509288449' -Headers $headers -TimeoutSec 15
  Write-Output ($resp | ConvertTo-Json -Depth 10)
} catch {
  if ($_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Output ("HTTP " + $_.Exception.Response.StatusCode)
    Write-Output $body
  } else {
    Write-Output ("ERR: " + $_.Exception.Message)
  }
}
