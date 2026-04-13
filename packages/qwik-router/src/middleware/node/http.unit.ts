import {
  getPlatform,
  setPlatform,
  type JSXOutput,
  type StreamWriter,
} from '@qwik.dev/core/internal';
import { renderToStream } from '@qwik.dev/core/server';
import { EventEmitter } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { performance } from 'node:perf_hooks';
import { assert, describe, expect, test, vi } from 'vitest';
import { fromNodeHttp, normalizeUrl } from './http';

[
  {
    url: '/',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/',
  },
  {
    url: '/attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/attacker.com',
  },
  {
    url: '//attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/attacker.com',
  },
  {
    url: '\\\\attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/attacker.com',
  },
  {
    url: '///attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/attacker.com',
  },
  {
    url: '/some-path//attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/some-path/attacker.com',
  },
  {
    url: '/callback?redirect=https://idp.example/callback',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/callback?redirect=https://idp.example/callback',
  },
].forEach((t) => {
  test(`normalizeUrl(${t.url}, ${t.base})`, () => {
    assert.equal(normalizeUrl(t.url, t.base).href, t.expect);
  });
});

describe('fromNodeHttp()', () => {
  test('should resolve writes from the node write callback without waiting for drain', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    let writeCallback: ((error?: Error | null) => void) | undefined;
    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    res.write = vi.fn((_chunk: Uint8Array, cb?: (error?: Error | null) => void) => {
      writeCallback = cb;
      return false;
    }) as any;
    res.end = vi.fn((cb?: () => void) => {
      cb?.();
      return res;
    }) as any;

    const requestEv = await fromNodeHttp(new URL('http://localhost/'), req, res, 'server');
    const writableStream = requestEv.getWritableStream(
      200,
      new Headers([['Content-Type', 'text/html; charset=utf-8']]),
      { headers: () => [] } as any,
      () => {},
      undefined as any
    );
    const writer = writableStream.getWriter();

    const writePromise = writer.write(new Uint8Array([1, 2, 3]));
    await Promise.resolve();
    expect(res.listenerCount('drain')).toBe(0);
    expect(writeCallback).toBeDefined();

    writeCallback?.(null);
    await writePromise;
    await writer.close();

    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  // Verifies the Node adapter starts making response-write progress before a large SSR render fully completes.
  test('should make Node response progress before render completes', async () => {
    const timings = {
      renderStarted: 0,
      renderDone: 0,
      firstSocketWrite: 0,
    };
    const jsx: JSXOutput = Array.from({ length: 4_000 }, (_, i) => `chunk-${i}-${'x'.repeat(96)}`);
    const cookies = {
      headers: () => [],
    };

    const server = createServer(async (req, res) => {
      res.socket?.setNoDelay(true);
      const socket = res.socket;
      if (socket) {
        const originalSocketWrite = socket.write.bind(socket);
        socket.write = ((chunk: any, ...args: any[]) => {
          if (timings.firstSocketWrite === 0) {
            timings.firstSocketWrite = performance.now();
          }
          return originalSocketWrite(chunk, ...args);
        }) as typeof socket.write;
      }

      const requestEv = await fromNodeHttp(
        new URL(req.url || '/', 'http://127.0.0.1'),
        req,
        res,
        'server'
      );
      const writableStream = requestEv.getWritableStream(
        200,
        new Headers([['Content-Type', 'text/html; charset=utf-8']]),
        cookies as any,
        () => {},
        undefined as any
      );
      const writer = writableStream.getWriter();
      const encoder = new TextEncoder();
      const stream: StreamWriter = {
        write(chunk: string) {
          return writer.write(encoder.encode(chunk));
        },
      };
      const platform = getPlatform();

      try {
        timings.renderStarted = performance.now();
        await renderToStream(jsx, {
          containerTagName: 'div',
          qwikLoader: 'never',
          stream,
          streaming: {
            inOrder: {
              strategy: 'auto',
              maximumInitialChunk: 128,
              maximumChunk: 64,
            },
          },
        });
        timings.renderDone = performance.now();
      } finally {
        setPlatform(platform);
        await writer.close();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Failed to bind test server');
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect(address.port, '127.0.0.1', () => {
          socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
        });

        socket.on('data', () => {
          // Intentionally empty: the request must be consumed to let the server drain.
        });
        socket.on('end', resolve);
        socket.on('error', reject);
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    expect(timings.firstSocketWrite).toBeGreaterThan(0);
    expect(timings.renderDone).toBeGreaterThan(timings.renderStarted);
    expect(timings.firstSocketWrite).toBeLessThan(timings.renderDone);
  });
});
