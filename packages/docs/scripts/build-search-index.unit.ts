import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createApiSearchPages } from './build-search-index';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('createApiSearchPages', () => {
  test('creates one page per API symbol heading linking to its anchor', () => {
    const routesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwik-search-'));
    tempDirs.push(routesDir);
    fs.mkdirSync(path.join(routesDir, 'qwik'));
    fs.mkdirSync(path.join(routesDir, 'no-api'));
    fs.writeFileSync(
      path.join(routesDir, 'qwik', 'index.mdx'),
      [
        '# [API](/api) &rsaquo; @qwik.dev/core',
        '',
        '<h2 id="rendertostream-function">renderToStream</h2>',
        '',
        'Streams the `<html>` of the app.',
        '',
        '[Edit this section](https://github.com/QwikDev/qwik/edit/main/render.ts)',
        '',
        '<h2 id="usesignal">useSignal</h2>',
        '',
        'Creates a signal.',
        '',
      ].join('\n')
    );

    expect(createApiSearchPages(routesDir)).toEqual([
      {
        url: '/api/qwik/#rendertostream-function',
        content:
          '<html lang="en"><body data-pagefind-body><h1>renderToStream</h1>Streams the <code>&lt;html&gt;</code> of the app.</body></html>',
      },
      {
        url: '/api/qwik/#usesignal',
        content:
          '<html lang="en"><body data-pagefind-body><h1>useSignal</h1>Creates a signal.</body></html>',
      },
    ]);
  });

  test('covers the generated API pages', () => {
    const urls = createApiSearchPages().map((page) => page.url);

    expect(urls).toContain('/api/qwik/#usesignal-variable');
    expect(urls).toContain('/api/qwik-server/#rendertostream-function');
    expect(urls).toContain('/api/qwik-router/#routeloader_');
  });
});
