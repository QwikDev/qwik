import { assert } from 'vitest';
import { testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Ignore Routes', {
  ignoreRoutes: ['docs/**', 'dashboard/settings/**'],
});

test('ignored folder contributes no routes', ({ ctx }) => {
  assert.deepEqual(
    ctx.routes.filter((r) => r.pathname.startsWith('/docs')),
    []
  );
});

test('ignored folder contributes no layouts', ({ ctx }) => {
  assert.deepEqual(
    ctx.layouts.filter((l) => l.dirPath.includes('/docs')),
    []
  );
});

test('ignored folder contributes no menus', ({ ctx }) => {
  assert.deepEqual(ctx.menus, []);
});

test('ignored nested folder contributes no routes', ({ ctx }) => {
  assert.equal(
    ctx.routes.some((r) => r.pathname === '/dashboard/settings/'),
    false
  );
});

test('sibling routes of an ignored folder survive', ({ assertRoute }) => {
  assertRoute('/dashboard/');
  assertRoute('/dashboard/profile/');
});

test('the parent layout of an ignored folder survives', ({ assertRoute }) => {
  const r = assertRoute('/dashboard/');
  assert.equal(r.layouts.at(-1)!.id, 'DashboardLayout');
});

test('ignored paths are recorded for the build log', ({ ctx }) => {
  assert.deepEqual(ctx.ignoredRoutePaths, ['dashboard/settings/', 'docs/']);
});
