@echo off
cd /d "%~dp0"
echo Serwer na http://localhost:3000
start http://localhost:3000
powershell -Command "$l=[System.Net.HttpListener]::new(); $l.Prefixes.Add('http://localhost:3000/'); $l.Start(); write-host 'OK' -ForegroundColor Green; while($l.IsListening){$c=$l.GetContext();$p=$c.Request.Url.LocalPath;if($p-eq'/'){$p='/index.html'};if($p.EndsWith('/')){$p+='index.html'};$f=Join-Path $PSScriptRoot $p.TrimStart('/');if(Test-Path $f -PathType Leaf){$b=[IO.File]::ReadAllBytes($f);$c.Response.ContentLength64=$b.Length;$c.Response.OutputStream.Write($b,0,$b.Length)}else{$c.Response.StatusCode=404};$c.Response.Close()}"
pause
