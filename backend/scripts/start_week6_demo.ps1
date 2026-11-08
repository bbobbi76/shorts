$ErrorActionPreference = 'Stop'
$repoDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$demoDir = [IO.Path]::GetFullPath((Join-Path $repoDir '../tmp/week6-mysql'))
$pythonExe = Join-Path $repoDir '.venv/Scripts/python.exe'
$backendDir = Join-Path $repoDir 'backend'
$frontendDir = Join-Path $repoDir 'Front'
$mysqlExe = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe'

function Test-DemoPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $pending = $client.ConnectAsync('127.0.0.1', $Port)
        return $pending.Wait(500) -and $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}

if (!(Test-Path -LiteralPath $pythonExe) -or !(Test-Path -LiteralPath (Join-Path $demoDir 'data/mysql'))) {
    throw 'This launcher requires the local week 6 demo environment already provisioned. See backend/docs/WEEK6_BACKEND_INTEGRATION.md.'
}
$logDir = Join-Path $demoDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (!(Test-DemoPort 3307)) {
    Start-Process -FilePath $mysqlExe -WorkingDirectory $demoDir -WindowStyle Hidden -ArgumentList @('--no-defaults', '--datadir=./data', '--port=3307', '--mysqlx=OFF', '--bind-address=127.0.0.1', '--console') -RedirectStandardOutput (Join-Path $logDir "mysql-$stamp.out.log") -RedirectStandardError (Join-Path $logDir "mysql-$stamp.err.log") | Out-Null
    for ($attempt = 0; $attempt -lt 30 -and !(Test-DemoPort 3307); $attempt++) { Start-Sleep -Milliseconds 500 }
    if (!(Test-DemoPort 3307)) { throw "MySQL did not start. Check $logDir" }
}
if (!(Test-DemoPort 8000)) {
    Start-Process -FilePath $pythonExe -WorkingDirectory $backendDir -WindowStyle Hidden -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') -RedirectStandardOutput (Join-Path $logDir "backend-$stamp.out.log") -RedirectStandardError (Join-Path $logDir "backend-$stamp.err.log") | Out-Null
}
if (!(Test-DemoPort 5186)) {
    $nodeExe = (Get-Command node.exe).Source
    Start-Process -FilePath $nodeExe -WorkingDirectory $frontendDir -WindowStyle Hidden -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5186') -RedirectStandardOutput (Join-Path $logDir "frontend-$stamp.out.log") -RedirectStandardError (Join-Path $logDir "frontend-$stamp.err.log") | Out-Null
}
for ($attempt = 0; $attempt -lt 30 -and (!(Test-DemoPort 8000) -or !(Test-DemoPort 5186)); $attempt++) { Start-Sleep -Milliseconds 500 }
if (!(Test-DemoPort 8000) -or !(Test-DemoPort 5186)) { throw "Application did not start. Check $logDir" }
Write-Output 'Demo: http://127.0.0.1:5186/learn'
Write-Output 'API:  http://127.0.0.1:8000/docs'
Write-Output "Logs: $logDir"
