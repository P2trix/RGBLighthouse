# Prosty serwer HTTP dla lighthouse-project
$port = 3000
$root = $PSScriptRoot

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Serwer dziala na http://localhost:$port" -ForegroundColor Green
Write-Host "Nacisnij Ctrl+C aby zatrzymac" -ForegroundColor Yellow

# Otwórz przeglądarkę
Start-Process "http://localhost:$port"

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css'
  '.js'   = 'application/javascript'
  '.glb'  = 'model/gltf-binary'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response

  $path = $req.Url.LocalPath
  if ($path -eq '/') { $path = '/index.html' }
  $file = Join-Path $root $path.TrimStart('/')

  if (Test-Path $file -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($file)
    $mime = if ($mimeTypes[$ext]) { $mimeTypes[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $res.ContentType = $mime
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }

  $res.Close()
}
