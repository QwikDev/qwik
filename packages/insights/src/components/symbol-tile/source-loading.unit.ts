vi.mock('~/components/report-scope/use-report-query', () => ({
  useReportQuery: () => new URLSearchParams(),
}));
import { expect, test, vi } from 'vitest';
import type * as Qwik from '@qwik.dev/core';

const resource = vi.hoisted(() => ({ run: null as any, state: null as any }));
const loadSource = vi.hoisted(() => vi.fn());
vi.mock('@qwik.dev/core', async (importOriginal) => {
  const captureResource = (run: unknown) => {
    resource.run = run;
    return {};
  };
  return {
    ...(await importOriginal<typeof Qwik>()),
    component$: (render: unknown) => render,
    componentQrl: (render: unknown) => render,
    useStore: (state: unknown) => (resource.state = state),
    useResource$: captureResource,
    useResourceQrl: captureResource,
  };
});
vi.mock('@qwik.dev/router', () => ({
  getRequestEvent: () => ({
    params: {},
    sharedMap: new Map([['insightUser', { isAuthorizedForApp: (key: string) => key === 'app-a' }]]),
    error: () => new Error('Forbidden'),
  }),
  server$: (fn: unknown) => fn,
  serverQrl: (fn: unknown) => fn,
  useLocation: () => ({
    params: { publicApiKey: 'app-a' },
    url: new URL('https://insights.test/app/app-a/'),
  }),
}));
vi.mock('~/db', () => ({ getDB: () => ({}) }));
vi.mock('~/db/source', () => ({ loadSymbolSource: loadSource }));
vi.mock('~/db/sql-user', () => ({ dbGetInsightUser: vi.fn() }));
vi.mock('~/routes/app/layout', () => ({
  getInsightUser: (map: Map<string, unknown>) => map.get('insightUser'),
}));

test('loads source even when the Bundles view supplies the symbol name and origin', async () => {
  (globalThis as any).__EXPERIMENTAL__ = {};
  const { SymbolSource } = await import('./index');
  const source = { preamble: '', highlight: 'source code', postamble: '' };
  loadSource.mockResolvedValue({
    fullName: 'Button',
    origin: 'button.tsx',
    originUrl: 'https://github.com/example/site/blob/main/button.tsx',
    revision: 'main',
    source,
    status: 'loaded',
  });
  await (SymbolSource as any)({ fullName: 'Button', origin: 'button.tsx', symbolHash: 'hash' });
  expect(resource.state.fullName).toBe('Button');
  expect(await resource.run({ track: (read: () => unknown) => read() })).toEqual(source);
  expect(loadSource).toHaveBeenCalledWith({}, 'app-a', 'hash');
});
