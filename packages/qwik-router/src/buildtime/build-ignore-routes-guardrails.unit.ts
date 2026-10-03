import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, afterEach, test, vi } from 'vitest';
import { parseRoutesDir } from './build';
import { createBuildContext } from './context';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const testAppRootDir = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'e2e',
  'qwik-e2e',
  'apps',
  'qwikrouter-test'
);

/** Runs a real scan of the test app and returns what it produced and reported. */
async function scan(ignoreRoutes: string[], isDevServer = false) {
  const warnings: string[] = [];
  const warnSpy = vi
    .spyOn(console, 'warn')
    .mockImplementation((m) => void warnings.push(String(m)));
  const ctx = createBuildContext(testAppRootDir, '/', { ignoreRoutes }, 'ssr', false, isDevServer);
  const error = await parseRoutesDir(ctx).then(
    () => null,
    (e: Error) => e
  );
  warnSpy.mockRestore();
  return { ctx, error, warnings };
}

afterEach(() => vi.restoreAllMocks());

test('a pattern that matches nothing fails the build', async () => {
  const { error } = await scan(['typo-that-matches-nothing/**']);
  assert.match(String(error), /typo-that-matches-nothing\/\*\*/);
  assert.match(String(error), /matched nothing/);
});

test('an unnormalised pattern matches nothing and says so', async () => {
  const { error } = await scan(['./docs/**']);
  assert.match(String(error), /matched nothing/);
});

test('a pattern that matches nothing only warns in dev', async () => {
  const { error, warnings } = await scan(['typo-that-matches-nothing/**'], true);
  assert.equal(error, null);
  assert.equal(
    warnings.some((w) => w.includes('matched nothing')),
    true
  );
});

test('ignoring a layout that still wraps kept routes fails the build', async () => {
  const { error } = await scan(['dashboard/layout.tsx']);
  assert.match(String(error), /dashboard\/layout\.tsx/);
  assert.match(String(error), /still wraps/);
});

test('ignoring a whole folder never trips the layout guardrail', async () => {
  const { error } = await scan(['dashboard/**']);
  assert.equal(error, null);
});

test('ignoring a boundary that still covers kept routes warns', async () => {
  const { error, warnings } = await scan(['404.tsx']);
  assert.equal(error, null);
  assert.equal(
    warnings.some((w) => w.includes('404.tsx') && w.includes('nearest parent boundary')),
    true
  );
});

test('ignoring every route fails the build', async () => {
  const { error } = await scan(['**']);
  assert.match(String(error), /no routes/);
});

test('a successful scan logs the skipped paths once', async () => {
  const { ctx, error, warnings } = await scan(['docs/**', 'dashboard/settings/**']);
  assert.equal(error, null);
  const log = warnings.find((w) => w.includes('ignoreRoutes'));
  assert.equal(log, 'qwik-router: ignoreRoutes skipped 2 paths: dashboard/settings/, docs/');

  ctx.isDirty = true;
  const second: string[] = [];
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation((m) => void second.push(String(m)));
  await parseRoutesDir(ctx);
  warnSpy.mockRestore();
  assert.equal(
    second.some((w) => w.includes('ignoreRoutes skipped')),
    false
  );
});

test('no ignoreRoutes means no log and no guardrails', async () => {
  const { error, warnings } = await scan([]);
  assert.equal(error, null);
  assert.equal(
    warnings.some((w) => w.includes('ignoreRoutes')),
    false
  );
});

test('naming a folder without a wildcard still drops its whole subtree', async () => {
  const { ctx, error } = await scan(['docs']);
  assert.equal(error, null);
  assert.deepEqual(ctx.ignoredRoutePaths, ['docs/']);
  assert.deepEqual(
    ctx.routes.filter((r) => r.pathname.startsWith('/docs')),
    []
  );
  assert.deepEqual(ctx.menus, []);
});

test('a trailing /* keeps the folder node but drops what is inside it', async () => {
  const { ctx, error } = await scan(['docs/*']);
  assert.equal(error, null);
  assert.deepEqual(
    ctx.routes.filter((r) => r.pathname.startsWith('/docs')),
    []
  );
});

test('a pattern matching only inside another ignored folder is not reported unused', async () => {
  const { ctx, error } = await scan(['docs/**', '**/overview/**']);
  assert.equal(error, null);
  assert.deepEqual(ctx.ignoredRoutePaths, ['docs/']);
});

test('a fixed pattern stops failing the next scan', async () => {
  const { ctx, error } = await scan(['typo-that-matches-nothing/**']);
  assert.match(String(error), /matched nothing/);

  ctx.opts.ignoreRoutes = ['docs/**'];
  ctx.isDirty = true;
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const second = await parseRoutesDir(ctx).then(
    () => null,
    (e: Error) => e
  );
  warnSpy.mockRestore();
  assert.equal(second, null);
});
