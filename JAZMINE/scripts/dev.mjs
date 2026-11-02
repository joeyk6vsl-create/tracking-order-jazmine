import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import 'dotenv/config';

const compile = spawn(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'],
  { stdio: 'inherit' },
);
const [code] = await once(compile, 'exit');
if (code !== 0) process.exit(Number(code) || 1);
const documents = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--config', 'apps/web/vite.documents.config.mts'],
  { stdio: 'inherit' },
);
const [documentCode] = await once(documents, 'exit');
if (documentCode !== 0) process.exit(Number(documentCode) || 1);
const webPort = Number(process.env.JAZMINE_WEB_PORT || 5173);
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535)
  throw new Error('Invalid web port');
const apiPort = Number(process.env.PORT || 3100);
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)
  throw new Error('Invalid API port');
for (const port of [webPort, apiPort])
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(new Error(`พอร์ต ${port} ถูกใช้งานอยู่ กรุณาปิดโปรแกรมเดิมก่อน`)),
    );
    probe.listen(port, '127.0.0.1', () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  });
const server = spawn(process.execPath, ['dist/apps/server/src/main.js'], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});
const children = [
  server,
  spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--config',
      resolve('apps/web/vite.config.mts'),
      '--port',
      String(webPort),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    { stdio: 'inherit' },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  // Windows kill() หยุดทันที จึงขอให้หลังบ้านปิดฐานและคืนสิทธิ์โฟลเดอร์ก่อน
  if (server.connected) server.send('jazmine:shutdown', (error) => error && server.kill());
  else server.kill();
  const deadline = setTimeout(() => server.kill(), 60000);
  deadline.unref();
  server.once('exit', () => clearTimeout(deadline));
  for (const child of children) if (child !== server) child.kill();
}
for (const child of children)
  child.on('exit', (code) => {
    if (!stopping && code !== null && code !== 0) process.exitCode = code;
    stop();
  });
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
console.log(`เปิดหน้าจอที่ http://localhost:${webPort} — หยุดด้วย Ctrl+C`);
