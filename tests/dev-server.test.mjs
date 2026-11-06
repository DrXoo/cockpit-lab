import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createDevServer } from '../scripts/dev-server.mjs';

async function serve(t, root) {
  const server = createDevServer(root);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('Development server serves the unchanged app and JavaScript with query strings', async t => {
  const url = await serve(t);
  const index = await fetch(url);
  assert.equal(index.status, 200);
  assert.equal(await index.text(), await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'));
  const module = await fetch(`${url}/model.js?v=9-office-chair`);
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /^text\/javascript/);
  assert.equal(await module.text(), await readFile(new URL('../dist/model.js', import.meta.url), 'utf8'));
});

test('Development server supports HEAD and rejects mutation methods and missing files', async t => {
  const url = await serve(t);
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) > 0);
  assert.equal(await head.text(), '');
  const post = await fetch(url, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  assert.equal((await fetch(`${url}/missing-file`)).status, 404);
});

test('Development server does not expose repository files or encoded parent paths', async t => {
  const url = await serve(t);
  assert.equal((await fetch(`${url}/README.md`)).status, 404);
  assert.equal((await fetch(`${url}/.git/config`)).status, 403);
  assert.equal((await fetch(`${url}/%2e%2e%2fREADME.md`)).status, 403);
  assert.equal((await fetch(`${url}/%E0%A4%A`)).status, 400);
});

test('Development server rejects symbolic links that escape its public directory', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'cockpit-lab-server-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = join(temp, 'public');
  await mkdir(root);
  await writeFile(join(temp, 'outside.txt'), 'private test data');
  try {
    await symlink(join(temp, 'outside.txt'), join(root, 'escape.txt'));
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('Creating symlinks requires additional permissions on this OS');
    throw error;
  }
  const url = await serve(t, root);
  assert.equal((await fetch(`${url}/escape.txt`)).status, 403);
});
