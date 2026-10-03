import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getImageSizeServer } from './image-size-server';

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
