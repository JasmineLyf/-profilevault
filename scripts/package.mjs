import { zipSync, unzipSync } from 'fflate';
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
const files = {};
async function walk(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) await walk(dir + '/' + entry.name, key + '/');
    else files[key] = new Uint8Array(await readFile(dir + '/' + entry.name));
  }
}
await walk('dist');
const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
if (
  JSON.stringify(manifest.permissions) !== JSON.stringify(['storage', 'activeTab', 'scripting']) ||
  manifest.host_permissions ||
  manifest.content_scripts
)
  throw Error('PERMISSIONS');
for (const p of [
  'ui/index.html',
  'content/entry.js',
  'background/service-worker.js',
  'icons/128.png',
  'ui/pdf.worker.min.mjs',
])
  if (!files[p]) throw Error('MISSING_ENTRY');
for (const [name, data] of Object.entries(files)) {
  if (
    (name.startsWith('background/') ||
      name.startsWith('content/') ||
      name.startsWith('ui/assets/index-')) &&
    name.endsWith('.js') &&
    /\beval\s*\(|https?:\/\/(?!www\.w3\.org|react\.dev\/errors\/)/.test(
      new TextDecoder().decode(data),
    )
  )
    throw Error('REMOTE_OR_EVAL:' + name);
  for (const needle of ['qiao.yun@example.test', '2025550147', '乔云'])
    if (new TextDecoder().decode(data).includes(needle)) throw Error('TEST_DATA_IN_BUILD');
}
await mkdir('release', { recursive: true });
const zip = zipSync(files, { level: 9 });
await writeFile(`release/profilevault-${manifest.version}.zip`, zip);
await writeFile(
  'release/SHA256.txt',
  createHash('sha256').update(zip).digest('hex') + `  profilevault-${manifest.version}.zip\n`,
);
const releaseRoot = resolve('release'),
  unpacked = resolve(releaseRoot, 'unpacked');
if (relative(releaseRoot, unpacked) !== 'unpacked') throw Error('UNSAFE_OUTPUT_PATH');
await rm(unpacked, { recursive: true, force: true });
for (const [name, data] of Object.entries(unzipSync(zip))) {
  const path = 'release/unpacked/' + name;
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, data);
}
console.log('ZIP verified:', Object.keys(files).length, 'files');
