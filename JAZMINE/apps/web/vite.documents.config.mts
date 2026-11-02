import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
const pdfAssets = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    react(),
    {
      name: 'offline-pdf-assets',
      async generateBundle() {
        for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs'])
          for (const entry of await readdir(join(pdfAssets, dir), { withFileTypes: true }))
            if (entry.isFile())
              this.emitFile({
                type: 'asset',
                fileName: `pdfjs-assets/${dir}/${entry.name}`,
                source: await readFile(join(pdfAssets, dir, entry.name)),
              });
      },
    },
  ],
  build: {
    outDir: '../../dist/document-renderer/archive-v1',
    emptyOutDir: true,
    assetsInlineLimit: 1000000,
    lib: {
      entry: fileURLToPath(new URL('./src/document-renderer/render.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'document-renderer.js',
      cssFileName: 'document-renderer',
    },
  },
});
