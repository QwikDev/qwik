import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { Connect, ViteDevServer } from 'vite';
import { afterAll, describe, expect, test } from 'vitest';
import { staticDistMiddleware } from './dev-server';

describe('staticDistMiddleware', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'qwik-city-static-'));
  const rootDir = join(tempDir, 'webroot');
  const distDir = join(rootDir, 'dist');
  const secretPath = join(tempDir, 'secret.json');

  mkdirSync(distDir, { recursive: true });
  writeFileSync(secretPath, '{"secret":true}');
  writeFileSync(join(distDir, 'app.js'), 'export default true;');

  const middleware = staticDistMiddleware({
    config: {
      root: rootDir,
      build: { outDir: 'dist' },
      publicDir: 'public',
    },
  } as ViteDevServer);

  afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

  test('does not serve files outside static directories through the query string', async () => {
    const result = await request('/x?../../../../secret.json');

    expect(result.nextCalled).toBe(true);
    expect(result.responseBody).toBe('');
  });

  test('serves static files when a query string is present', async () => {
    const result = await request('/app.js?v=1');

    expect(result.nextCalled).toBe(false);
    expect(result.responseBody).toBe('export default true;');
  });

  const request = async (originalUrl: string) => {
    const req = {
      originalUrl,
      headers: { host: 'localhost' },
    } as Connect.IncomingMessage;
    const res = new PassThrough() as PassThrough & ServerResponse;
    res.writeHead = (() => res) as typeof res.writeHead;
    let nextCalled = false;
    const response = collectResponse(res);

    await middleware(req, res, () => {
      nextCalled = true;
      res.end();
    });
    const responseBody = await response;

    return { nextCalled, responseBody };
  };
});

const collectResponse = (stream: PassThrough) =>
  new Promise<string>((resolve) => {
    let response = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => (response += chunk));
    stream.on('end', () => resolve(response));
  });
