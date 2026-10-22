import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'vite';
await build({
  configFile: false,
  root: 'tests/fixtures',
  build: {
    outDir: '../../test-results/fixture',
    emptyOutDir: false,
    rollupOptions: { input: ['tests/fixtures/react.html', 'tests/fixtures/recruiting.html'] },
  },
});
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file =
      path === '/'
        ? 'tests/fixtures/basic.html'
        : path === '/recruiting'
          ? 'test-results/fixture/recruiting.html'
          : path === '/react'
            ? 'test-results/fixture/react.html'
            : path.startsWith('/assets/')
              ? 'test-results/fixture' + path
              : '';
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html; charset=utf-8',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(4317, '127.0.0.1');
