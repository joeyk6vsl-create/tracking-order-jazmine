$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $nodeFolder = Join-Path $runtimeRoot 'node\bin'
  if (Test-Path -LiteralPath (Join-Path $nodeFolder 'node.exe')) { $env:PATH = $nodeFolder + ';' + $env:PATH }
}
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$pnpmPath = if ($pnpmCommand) { $pnpmCommand.Source } else { Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'กรุณาติดตั้ง Node.js 24 ขึ้นไป' }
$nodeMajor = & node -p "process.versions.node.split('.')[0]"
if ([int]$nodeMajor -lt 24) { throw 'ต้องใช้ Node.js 24 ขึ้นไป' }
if (-not (Test-Path -LiteralPath $pnpmPath)) { throw 'ไม่พบ pnpm กรุณาติดตั้ง pnpm ก่อนเปิดโปรแกรม' }
if (-not (Test-Path -LiteralPath 'node_modules')) {
  Write-Host 'กำลังติดตั้งเครื่องมือครั้งแรก ต้องเชื่อมต่ออินเทอร์เน็ต'
  & $pnpmPath install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'ติดตั้งเครื่องมือไม่สำเร็จ' }
}
$jazmineWebPort = if ($env:JAZMINE_WEB_PORT) { $env:JAZMINE_WEB_PORT } else { '5173' }
Write-Host "เปิดเบราว์เซอร์ที่ http://localhost:$jazmineWebPort หลังหน้าต่างนี้แสดงว่าโปรแกรมพร้อม"
if ($env:JAZMINE_RECOVERY_MODE -eq '1') { Write-Host 'กำลังเปิดสำเนากู้คืน ข้อมูลต้นฉบับไม่ถูกทับ' }
Write-Host 'ใช้ Ctrl+C เพื่อหยุดโปรแกรม เก็บหน้าต่างนี้ไว้ระหว่างใช้งาน'
& $pnpmPath dev
exit $LASTEXITCODE
