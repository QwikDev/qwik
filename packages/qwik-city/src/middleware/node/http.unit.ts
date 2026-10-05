import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { assert, describe, expect, test } from 'vitest';
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

  const createResponse = () => new EventEmitter() as ServerResponse & EventEmitter;

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

    await expect(requestEv.request.arrayBuffer()).rejects.toMatchObject({ status: 413 });
  });
});
