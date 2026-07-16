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
import { Readable } from 'node:stream';
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
  const createBodyRequest = (chunks: Uint8Array[]) => {
    const req = Readable.from(chunks) as IncomingMessage;
    req.method = 'POST';
    req.url = '/';
    req.headers = { host: 'localhost' };
    Object.defineProperty(req, 'socket', { value: {}, configurable: true });
    return req;
  };

  const createResponse = () => {
    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    return res;
  };

  test('should accept request bodies at the byte limit', async () => {
    const requestEv = await fromNodeHttp(
      new URL('http://localhost/'),
      createBodyRequest([Buffer.alloc(4), Buffer.alloc(4)]),
      createResponse(),
      'server',
      undefined,
      8
    );

    await expect(requestEv.request.arrayBuffer()).resolves.toHaveProperty('byteLength', 8);
  });

  test.each([[4, 5], [9]])('should reject request bodies over the byte limit', async (...sizes) => {
    const requestEv = await fromNodeHttp(
      new URL('http://localhost/'),
      createBodyRequest(sizes.map((size) => Buffer.alloc(size))),
      createResponse(),
      'server',
      undefined,
      8
    );

    await expect(requestEv.request.arrayBuffer()).rejects.toMatchObject({
      code: 'QWIK_REQUEST_BODY_LIMIT',
      status: 413,
      statusCode: 413,
    });
  });

  test('should resolve writes immediately when res.write returns true (no backpressure)', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    res.write = vi.fn(() => true) as any;
    // Mimic vanilla Node: 'finish' fires once res.end() has flushed.
    res.end = vi.fn(() => {
      queueMicrotask(() => res.emit('finish'));
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

    await writer.write(new Uint8Array([1, 2, 3]));
    // No drain listener should be attached when there's no backpressure.
    expect(res.listenerCount('drain')).toBe(0);

    await writer.close();
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('should resolve writes via the drain event when res.write returns false', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    res.write = vi.fn(() => false) as any; // simulate backpressure
    res.end = vi.fn(() => {
      queueMicrotask(() => res.emit('finish'));
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
    // A drain listener should be attached because res.write() returned false.
    expect(res.listenerCount('drain')).toBe(1);

    res.emit('drain');
    await writePromise;
    expect(res.listenerCount('drain')).toBe(0);

    await writer.close();
  });

  test('should not hang when wrapper middleware drops the per-write callback (e.g. compression)', async () => {
    // Reproduces the regression from https://github.com/QwikDev/qwik/pull/8557:
    // `compression` middleware wraps res.write with a 2-arg signature
    // (chunk, encoding) and never invokes the optional callback.
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    // Wrapper that mimics `compression`: callback is dropped.
    res.write = vi.fn((_chunk: Uint8Array, _encoding?: any) => false) as any;
    res.end = vi.fn(() => res) as any; // also drops callback

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
    res.emit('drain');
    await writePromise; // would hang forever before the fix

    const closePromise = writer.close();
    res.emit('finish'); // close() must resolve even though res.end's cb is dropped
    await closePromise;
  });

  test('should resolve the response when the writable stream is created', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    res.write = vi.fn((_chunk: Uint8Array, cb?: (error?: Error | null) => void) => {
      cb?.(null);
      return true;
    }) as any;
    res.end = vi.fn(() => {
      queueMicrotask(() => res.emit('finish'));
      return res;
    }) as any;

    const requestEv = await fromNodeHttp(new URL('http://localhost/'), req, res, 'server');
    const resolve = vi.fn();
    const writableStream = requestEv.getWritableStream(
      201,
      new Headers([['Content-Type', 'text/html; charset=utf-8']]),
      { headers: () => [] } as any,
      resolve,
      undefined as any
    );

    expect(resolve).toHaveBeenCalledWith(true);
    await writableStream.close();

    expect(res.statusCode).toBe(201);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('should abort the request signal on node request errors', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });

    const requestEv = await fromNodeHttp(new URL('http://localhost/'), req, res, 'server');

    req.emit('error', new Error('request socket reset'));

    expect(requestEv.request.signal.aborted).toBe(true);
  });

  test('should catch EPIPE write errors from aborted clients', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const error = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
      errno: -32,
      syscall: 'write',
    });
    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    res.write = vi.fn((_chunk: Uint8Array, cb?: (error?: Error | null) => void) => {
      cb?.(error);
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

    await expect(writer.write(new Uint8Array([1, 2, 3]))).resolves.toBeUndefined();
    await writer.close();

    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
  });

  test('should catch emitted EPIPE write errors from aborted clients', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const error = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
      errno: -32,
      syscall: 'write',
    });
    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    res.write = vi.fn(() => {
      res.emit('error', error);
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

    await expect(writer.write(new Uint8Array([1, 2, 3]))).resolves.toBeUndefined();
    await writer.close();

    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
  });

  test('should reject non-abort write errors', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    res.write = vi.fn((_chunk: Uint8Array, cb?: (error?: Error | null) => void) => {
      cb?.(new Error('unexpected write failure'));
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

    await expect(writer.write(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      'unexpected write failure'
    );

    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
  });

  test('should reject emitted non-abort write errors', async () => {
    const req = new EventEmitter() as IncomingMessage & EventEmitter;
    req.method = 'GET';
    req.url = '/';
    req.headers = { host: 'localhost' };
    (req as any).socket = {};

    const res = new EventEmitter() as ServerResponse & EventEmitter;
    Object.defineProperty(res, 'closed', { value: false, configurable: true });
    Object.defineProperty(res, 'destroyed', { value: false, configurable: true });
    res.setHeader = vi.fn();
    res.write = vi.fn(() => {
      res.emit('error', new Error('emitted write failure'));
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

    await expect(writer.write(new Uint8Array([1, 2, 3]))).rejects.toThrow('emitted write failure');

    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
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
