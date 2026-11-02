$ErrorActionPreference = 'Stop'
$projectFolder = Split-Path -Parent $PSScriptRoot
$recoveryToolId = [Guid]::NewGuid().ToString()
$env:LOCAL_DATA_DIR = Join-Path $projectFolder ('local-data\RECOVERY_TOOL_' + $recoveryToolId)
$env:DATABASE_URL = ''
$env:NODE_ENV = 'development'
$env:JAZMINE_RECOVERY_MODE = '1'
$env:PORT = '3103'
$env:JAZMINE_WEB_PORT = '5176'
$env:WEB_ORIGIN = 'http://localhost:5176'
$env:JAZMINE_API_TARGET = 'http://127.0.0.1:3103'
Write-Host 'เครื่องมือกู้คืนใช้ข้อมูลว่างแยกจากข้อมูลเดิม'
Write-Host 'เปิด http://localhost:5176 ตั้งบัญชีชั่วคราว แล้วไปเมนู Backup & recovery'
& (Join-Path $PSScriptRoot 'start-local.ps1')
exit $LASTEXITCODE
