import fs from 'node:fs';
import * as networkTools from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createAddressPolicy, getImageSizeServer, getInfoForSrc } from './image-size-server';

describe('POST /__image_fix', () => {
  const sys = { dynamicImport: (id: string) => import(id) } as any;
  const imgSource = '<img src="/logo.png" />\n';
  let workDir: string;

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  async function requestImageFix(
    params: Record<string, string>,
    headers: Record<string, string> = { host: 'localhost:5173', origin: 'http://localhost:5173' }
  ) {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwik-image-fix-'));
    const srcDir = path.join(workDir, 'app', 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const insideFile = path.join(srcDir, 'root.tsx');
    const outsideFile = path.join(workDir, 'outside.tsx');
    fs.writeFileSync(insideFile, imgSource);
    fs.writeFileSync(outsideFile, imgSource);

    const loc = params.loc.replace('<outside>', outsideFile);
    const query = new URLSearchParams({ width: '10', height: '20', ...params, loc });
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn(), write: vi.fn() };
    const next = vi.fn();
    const handler = getImageSizeServer(sys, path.join(workDir, 'app'), srcDir);
    await handler(
      { method: 'POST', url: `/__image_fix?${query}`, headers } as any,
      res as any,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledOnce();
    return {
      statusCode: res.statusCode,
      inside: fs.readFileSync(insideFile, 'utf-8'),
      outside: fs.readFileSync(outsideFile, 'utf-8'),
    };
  }

  test('writes the image size into the source file', async () => {
    const result = await requestImageFix({ loc: 'root.tsx:1:1' });
    expect(result.statusCode).toBe(200);
    expect(result.inside).toBe('<img width="10" height="20" src="/logo.png" />\n');
  });

  test.each([
    ['cross-site origin', { host: 'localhost:5173', origin: 'https://evil.example' }],
    ['missing origin', { host: 'localhost:5173' }],
  ])('rejects a request with %s', async (_, headers) => {
    const result = await requestImageFix({ loc: 'root.tsx:1:1' }, headers);
    expect(result.statusCode).toBe(403);
    expect(result.inside).toBe(imgSource);
  });

  test.each(['../../outside.tsx:1:1', '<outside>:1:1'])(
    'rejects loc %s outside srcDir',
    async (loc) => {
      const result = await requestImageFix({ loc });
      expect(result.statusCode).toBe(400);
      expect(result.outside).toBe(imgSource);
    }
  );

  test('rejects a non-integer size', async () => {
    const result = await requestImageFix({ loc: 'root.tsx:1:1', width: '1" data-injected="' });
    expect(result.statusCode).toBe(400);
    expect(result.inside).toBe(imgSource);
  });
});

const resolvePublicHostname = async () => ['93.184.216.34'];
const addressPolicy = createAddressPolicy(networkTools);

describe('getInfoForSrc', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('reads SVG dimensions from its viewBox', async () => {
    const svg = '<svg viewBox="0 0 640 320" xmlns="http://www.w3.org/2000/svg"></svg>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(svg))
    );

    await expect(
      getInfoForSrc('https://example.com/image.svg', {
        addressPolicy,
        resolveHostname: resolvePublicHostname,
      })
    ).resolves.toEqual({
      width: 640,
      height: 320,
      type: 'svg',
      size: svg.length,
    });
  });

  test('reads SVG dimensions with absolute units', async () => {
    const svg = '<svg width="2in" height="25.4mm" xmlns="http://www.w3.org/2000/svg"></svg>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(svg))
    );

    await expect(
      getInfoForSrc('https://example.com/image.svg', {
        addressPolicy,
        resolveHostname: resolvePublicHostname,
      })
    ).resolves.toMatchObject({
      width: 192,
      height: 96,
      type: 'svg',
    });
  });

  test.each([
    'file:///etc/passwd',
    'http://127.0.0.1/image.svg',
    'http://2130706433/image.svg',
    'http://[::1]/image.svg',
    'http://[::ffff:127.0.0.1]/image.svg',
    'http://[64:ff9b::7f00:1]/image.svg',
    'http://[fc00::1]/image.svg',
    'http://[fe80::1]/image.svg',
    'http://169.254.169.254/latest/meta-data/',
    'https://user:password@example.com/image.svg',
  ])('does not fetch unsafe URL %s', async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getInfoForSrc(url, { addressPolicy, resolveHostname: resolvePublicHostname })
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('does not fetch a hostname resolving to a private address', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getInfoForSrc('https://internal.example/image.svg', {
        addressPolicy,
        resolveHostname: async () => ['10.0.0.1'],
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects mixed public and private DNS results', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getInfoForSrc('https://mixed.example/image.svg', {
        addressPolicy,
        resolveHostname: async () => ['93.184.216.34', '192.168.1.1'],
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('pins requests to the validated DNS address', async () => {
    const svg = '<svg viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg"></svg>';
    const requestUrl = vi.fn(async () => new Response(svg));

    await expect(
      getInfoForSrc('https://example.com/image.svg', {
        addressPolicy,
        resolveHostname: resolvePublicHostname,
        requestUrl,
      })
    ).resolves.toMatchObject({ width: 1, height: 1 });
    expect(requestUrl).toHaveBeenCalledWith(
      new URL('https://example.com/image.svg'),
      '93.184.216.34'
    );
  });

  test('revalidates redirect targets', async () => {
    const fetchMock = vi.fn(async () => Response.redirect('http://127.0.0.1/private.svg', 302));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getInfoForSrc('https://example.com/image.svg', {
        addressPolicy,
        resolveHostname: resolvePublicHostname,
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://example.com/image.svg'),
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  test('rejects oversized image responses', async () => {
    const svg = '<svg viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg"></svg>';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(svg, {
            headers: { 'Content-Length': String(10 * 1024 * 1024 + 1) },
          })
      )
    );

    await expect(
      getInfoForSrc('https://example.com/image.svg', {
        addressPolicy,
        resolveHostname: resolvePublicHostname,
      })
    ).resolves.toBeUndefined();
  });

  test('stops streaming an image above the size limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(10 * 1024 * 1024 + 1)))
    );

    await expect(
      getInfoForSrc('https://example.com/image.png', {
        addressPolicy,
        resolveHostname: resolvePublicHostname,
      })
    ).resolves.toBeUndefined();
  });

  test('allows the current local development server', async () => {
    const svg = '<svg viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg"></svg>';
    const fetchMock = vi.fn(async () => new Response(svg));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getInfoForSrc('http://127.0.0.1:5173/image.svg', {
        addressPolicy,
        localAddress: '127.0.0.1',
        localPort: 5173,
      })
    ).resolves.toMatchObject({ width: 1, height: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('allows the current IPv6 development server', async () => {
    const svg = '<svg viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg"></svg>';
    const fetchMock = vi.fn(async () => new Response(svg));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getInfoForSrc('http://[::1]:5173/image.svg', {
        addressPolicy,
        localAddress: '::1',
        localPort: 5173,
      })
    ).resolves.toMatchObject({ width: 1, height: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
