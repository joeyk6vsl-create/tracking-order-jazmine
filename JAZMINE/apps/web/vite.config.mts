import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const pdfAssets = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const pdfDirectories = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    react(),
    {
      name: 'local-pdf-resources',
      configureServer(server) {
        server.middlewares.use('/pdfjs-assets', (req, res, next) => {
          const match = new URL(req.url ?? '/', 'http://local').pathname.match(
            /^\/(cmaps|standard_fonts|wasm|iccs)\/([\w.-]+)$/,
          );
          if (!match) return next();
          void readFile(join(pdfAssets, match[1], match[2]))
            .then((bytes) => {
              res.setHeader(
                'Content-Type',
                match[2].endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
              );
              res.end(bytes);
            })
            .catch(() => {
              res.statusCode = 404;
              res.end();
            });
        });
      },
      async generateBundle() {
        for (const dir of pdfDirectories)
          for (const entry of await readdir(join(pdfAssets, dir), { withFileTypes: true })) {
            if (entry.isFile())
              this.emitFile({
                type: 'asset',
                fileName: `pdfjs-assets/${dir}/${entry.name}`,
                source: await readFile(join(pdfAssets, dir, entry.name)),
              });
          }
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': process.env.JAZMINE_API_TARGET ?? 'http://127.0.0.1:3100' },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
