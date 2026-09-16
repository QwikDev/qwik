import { execFileSync } from 'node:child_process';
import * as networkTools from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createAddressPolicy, getInfoForSrc } from './image-size-server';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const resolvePublicHostname = async () => ['93.184.216.34'];
const addressPolicy = createAddressPolicy(networkTools);

function expectParserToTerminate(script: string) {
  expect(() =>
    execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: packageRoot,
      timeout: 500,
    })
  ).not.toThrow();
}

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

  test('rejects a zero-length ICNS entry', () => {
    expectParserToTerminate(`
      import { ICNS } from 'image-size/types/icns';
      const input = new Uint8Array(16);
      input.set(new TextEncoder().encode('icns'));
      new DataView(input.buffer).setUint32(4, 16);
      input.set(new TextEncoder().encode('ic07'), 8);
      try { ICNS.calculate(input); } catch {}
    `);
  });

  test('rejects a zero-length HEIF box', () => {
    expectParserToTerminate(`
      import { HEIF } from 'image-size/types/heif';
      const input = new Uint8Array(60);
      const view = new DataView(input.buffer);
      const encoder = new TextEncoder();
      const box = (offset, size, name) => {
        view.setUint32(offset, size);
        input.set(encoder.encode(name), offset + 4);
      };
      box(0, 12, 'ftyp'); input.set(encoder.encode('avif'), 8);
      box(12, 48, 'meta');
      box(24, 36, 'iprp');
      box(32, 28, 'ipco');
      box(40, 0, 'ispe');
      try { HEIF.calculate(input); } catch {}
    `);
  });

  test('rejects a zero-length JXL box', () => {
    expectParserToTerminate(`
      import { JXL } from 'image-size/types/jxl';
      const input = new Uint8Array(12);
      input.set(new TextEncoder().encode('jxlp'), 4);
      try { JXL.calculate(input); } catch {}
    `);
  });
});
