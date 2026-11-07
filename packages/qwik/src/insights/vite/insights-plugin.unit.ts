import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
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

const withDbEnv = async (fn: () => Promise<void>) => {
  const prev = process.env.QWIK_INSIGHTS_DB_URL;
  delete process.env.QWIK_INSIGHTS_DB_URL;
  try {
    await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.QWIK_INSIGHTS_DB_URL;
    } else {
      process.env.QWIK_INSIGHTS_DB_URL = prev;
    }
  }
};

test('sampleRate defaults to 1 in dev and 0.05 in a build', () =>
  withDbEnv(async () => {
    const dev = await callConfig(
      await getPlugin({ publicApiKey: 'key12345', db: 'file:/tmp/x.db' }),
      'serve'
    );
    expect(sample(dev.define)).toBe('1');
  }).then(() =>
    withDbEnv(async () => {
      const build = await callConfig(await getPlugin({ publicApiKey: 'key12345' }), 'build');
      expect(sample(build.define)).toBe('0.05');
    })
  ));

test('an explicit sampleRate wins over the mode default', () =>
  withDbEnv(async () => {
    const dev = await callConfig(
      await getPlugin({ publicApiKey: 'key12345', db: 'file:/tmp/x.db', sampleRate: 0.3 }),
      'serve'
    );
    expect(sample(dev.define)).toBe('0.3');
  }));

test('dev does not inject the tracker without a local DB (no central beaconing in dev)', () =>
  withDbEnv(async () => {
    const cfg = await callConfig(await getPlugin({ publicApiKey: 'key12345' }), 'serve');
    expect(cfg).toBeUndefined();
  }));

test('with db and no postUrl, dev beacons to the dev-server collector', () =>
  withDbEnv(async () => {
    const plugin = await getPlugin({ publicApiKey: 'key12345', db: 'file:.qwik/x.db' });
    const dev = await plugin.config({ root: '/app', base: '/docs/' }, { command: 'serve' });
    expect(dev.define['globalThis.__QI_URL__']).toBe('"/docs/__qwik-insights/"');
    // Relative paths resolve against the Vite root and are shared with the collector and devtools.
    expect(process.env.QWIK_INSIGHTS_DB_URL).toBe(`file:${resolve('/app', '.qwik/x.db')}`);
  }));

test('a build with db and no postUrl skips the tracker instead of beaconing centrally', () =>
  withDbEnv(async () => {
    const plugin = await getPlugin({ publicApiKey: 'key12345', db: 'file:/tmp/x.db' });
    expect(await callConfig(plugin, 'build')).toBeUndefined();
  }));

test('an explicit postUrl is used in dev and build', () =>
  withDbEnv(async () => {
    const opts = { publicApiKey: 'key12345', db: 'file:/tmp/x.db', postUrl: '/collect/' };
    const dev = await callConfig(await getPlugin(opts), 'serve');
    expect(dev.define['globalThis.__QI_URL__']).toBe('"/collect/"');
    const build = await callConfig(await getPlugin(opts), 'build');
    expect(build.define['globalThis.__QI_URL__']).toBe('"/collect/"');
  }));

test('the dev-server collector records beacons into the db', () =>
  withDbEnv(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwik-insights-dev-'));
    const plugin = await getPlugin({ publicApiKey: 'key12345', db: 'file:insights.db' });
    await plugin.config({ root: dir }, { command: 'serve' });
    let middleware: any;
    plugin.configureServer({ middlewares: { use: (fn: any) => (middleware = fn) } });

    const beacon = {
      qVersion: '2',
      manifestHash: 'dev',
      publicApiKey: 'key12345',
      symbols: [
        { symbol: 's_a', route: '/', delay: 1, latency: 1, timeline: 1, interaction: false },
      ],
    };
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(beacon))]), {
      method: 'POST',
      url: '/__qwik-insights/',
    });
    const body = await new Promise<string>((resolveBody, reject) => {
      const res = { setHeader() {}, end: resolveBody };
      middleware(req, res, reject);
    });

    expect(JSON.parse(body)).toEqual({ ok: true });
    const db = new DatabaseSync(join(dir, 'insights.db'), { readOnly: true });
    expect(db.prepare('SELECT "to" FROM edges').all()).toEqual([{ to: 'a' }]);
    db.close();
  }));

test('the pinger gets a content-hashed name that dev serves and the build emits', () =>
  withDbEnv(async () => {
    const plugin = await getPlugin({ publicApiKey: 'key12345', postUrl: '/collect/' });
    const cfg = await callConfig(plugin, 'build');
    const fileName = JSON.parse(cfg.define['globalThis.__QI_PINGER__']);
    expect(fileName).toMatch(/^qwik-insights-pinger-[0-9a-f]{8}\.js$/);

    let middleware: any;
    plugin.configureServer({ middlewares: { use: (fn: any) => (middleware = fn) } });
    const served = await new Promise<string>((resolveBody, reject) =>
      middleware(
        { method: 'GET', url: `/build/${fileName}?v=1` },
        { setHeader() {}, end: resolveBody },
        reject
      )
    );
    expect(served).toContain('qSymbolTracker');
  }));

test('dev injects the tracker for an explicit postUrl without a local DB', () =>
  withDbEnv(async () => {
    const plugin = await getPlugin({ publicApiKey: 'key12345', postUrl: '/collect/' });
    const dev = await callConfig(plugin, 'serve');
    expect(dev.define['globalThis.__QI_URL__']).toBe('"/collect/"');
  }));
