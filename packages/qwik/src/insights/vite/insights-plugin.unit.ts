import { expect, test } from 'vitest';
import { qwikInsights } from './insights-plugin';

const getPlugin = async (opts: Parameters<typeof qwikInsights>[0]) =>
  (await qwikInsights(opts)) as any;
const callConfig = (plugin: any, command: 'serve' | 'build') =>
  plugin.config(
    { root: '/tmp' },
    { command, mode: command === 'build' ? 'production' : 'development' }
  );

const sample = (define: any) => define['globalThis.__QI_SAMPLE__'];

test('sampleRate defaults to 1 in dev and 0.05 in a build', async () => {
  const dev = await callConfig(
    await getPlugin({ publicApiKey: 'key12345', db: 'file:/tmp/x.db' }),
    'serve'
  );
  expect(sample(dev.define)).toBe('1');

  const build = await callConfig(await getPlugin({ publicApiKey: 'key12345' }), 'build');
  expect(sample(build.define)).toBe('0.05');
});

test('an explicit sampleRate wins over the mode default', async () => {
  const dev = await callConfig(
    await getPlugin({ publicApiKey: 'key12345', db: 'file:/tmp/x.db', sampleRate: 0.3 }),
    'serve'
  );
  expect(sample(dev.define)).toBe('0.3');
});

test('dev does not inject the tracker without a local DB (no central beaconing in dev)', async () => {
  const prev = process.env.QWIK_INSIGHTS_DB_URL;
  delete process.env.QWIK_INSIGHTS_DB_URL;
  try {
    const cfg = await callConfig(await getPlugin({ publicApiKey: 'key12345' }), 'serve');
    expect(cfg).toBeUndefined();
  } finally {
    if (prev !== undefined) {
      process.env.QWIK_INSIGHTS_DB_URL = prev;
    }
  }
});
