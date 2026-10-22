import { build } from 'vite';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const distPath = resolve(projectRoot, 'dist');
if (resolve('.') !== projectRoot || relative(projectRoot, distPath) !== 'dist')
  throw Error('UNSAFE_OUTPUT_PATH');
await rm(distPath, { recursive: true, force: true });
const watch = process.argv.includes('--watch') ? {} : null;
await build({
  configFile: false,
  root: 'src/ui',
  base: './',
  build: { outDir: '../../dist/ui', emptyOutDir: false, watch },
});
for (const [entry, name] of [
  ['src/background/service-worker.ts', 'background/service-worker'],
  ['src/content/entry.ts', 'content/entry'],
]) {
  await build({
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      watch,
      lib: { entry, name: 'ProfileVault', formats: ['iife'], fileName: () => name + '.js' },
    },
  });
}
await copyFile('manifest.json', 'dist/manifest.json');
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/ui/pdf.worker.min.mjs');
await mkdir('dist/licenses', { recursive: true });
for (const name of ['react', 'react-dom', 'zod', 'fflate', 'pdfjs-dist'])
  await copyFile(`node_modules/${name}/LICENSE`, `dist/licenses/${name}-LICENSE.txt`);
await mkdir('dist/icons', { recursive: true });
const svg = Buffer.from(
  '<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="30" fill="#163c35"/><path d="M36 60V45a28 28 0 0 1 56 0v15M32 56h64v51H32z" fill="none" stroke="#d6edc5" stroke-width="9"/><circle cx="64" cy="80" r="7" fill="#d6edc5"/></svg>',
);
for (const size of [16, 32, 48, 128])
  await sharp(svg).resize(size, size).png().toFile(`dist/icons/${size}.png`);
