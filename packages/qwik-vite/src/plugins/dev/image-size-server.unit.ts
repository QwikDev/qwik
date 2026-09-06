import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getInfoForSrc } from './image-size-server';

const packageRoot = path.resolve(import.meta.dirname, '../../..');

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

    await expect(getInfoForSrc('https://example.com/image.svg')).resolves.toEqual({
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

    await expect(getInfoForSrc('https://example.com/image.svg')).resolves.toMatchObject({
      width: 192,
      height: 96,
      type: 'svg',
    });
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
