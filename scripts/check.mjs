import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
let failed = false;
for (const directory of ['scripts', 'tests']) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:js|mjs)$/.test(entry.name)) continue;
    const file = resolve(root, directory, entry.name);
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.error || result.status !== 0) failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log('Script and test syntax: OK.');
