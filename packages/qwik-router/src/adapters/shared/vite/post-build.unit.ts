import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { postBuild } from './post-build';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tmp() {
  const d = await mkdtemp(join(tmpdir(), 'qr-postbuild-'));
  dirs.push(d);
  return d;
}

/** Run postBuild against a temp client/server tree and return the injected STATIC_PATHS array. */
async function run(files: Record<string, string>, userStaticPaths: string[], cleanStatic = false) {
  const clientOutDir = await tmp();
  const serverOutDir = await tmp();
  for (const [rel, content] of Object.entries(files)) {
    const full = join(clientOutDir, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  await writeFile(
    join(serverOutDir, 'server.js'),
    `export const staticPaths = new Set(['__QWIK_ROUTER_STATIC_PATHS_ARRAY__']);`
  );
  await postBuild(clientOutDir, serverOutDir, '/', userStaticPaths, cleanStatic);
  const code = await readFile(join(serverOutDir, 'server.js'), 'utf-8');
  return JSON.parse(code.match(/new Set\((\[[^\]]*\])\)/)![1]) as string[];
}

test('lists a written loader sidecar of a static route, but not its index.html', async () => {
  const paths = await run(
    {
      'blog/index.html': '<html></html>',
      'blog/q-loader-WaXl02RHfZE.abc.json': '{"d":{}}',
    },
    ['/blog/']
  );
  expect(paths).toContain('/blog/');
  expect(paths).toContain('/blog/q-loader-WaXl02RHfZE.abc.json');
  expect(paths).not.toContain('/blog/index.html');
});

test('does not list a loader sidecar whose route is not static', async () => {
  const paths = await run({ 'other/q-loader-X.abc.json': '{"d":{}}' }, []);
  expect(paths).not.toContain('/other/q-loader-X.abc.json');
});
