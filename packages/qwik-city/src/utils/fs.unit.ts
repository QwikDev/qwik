import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { assert, test } from 'vitest';
import type { NormalizedPluginOptions } from '../buildtime/types';
import {
  createFileId,
  getExtension,
  getMenuPathname,
  getPathnameFromDirPath,
  isGroupedLayoutName,
  isMarkdownExt,
  isMenuFileName,
  isModuleExt,
  isPageExt,
  isPageModuleExt,
  normalizePath,
  parseRouteIndexName,
  removeExtension,
} from './fs';

const routesDir = normalizePath(join(tmpdir(), 'src', 'routes'));
const serverPluginsDir = normalizePath(join(tmpdir(), 'src', 'routes'));

test('isGroupedLayoutName', () => {
  const t = [
    { ext: '(abc)', expect: true },
    { ext: '__abc', expect: true }, // deprecated
    { ext: '(abc)xyz', expect: false },
    { ext: 'xyz(abc)', expect: false },
    { ext: '(abc', expect: false },
    { ext: 'abc)', expect: false },
    { ext: 'abc', expect: false },
  ];
  t.forEach((c) => {
    assert.equal(isGroupedLayoutName(c.ext, false), c.expect, c.ext);
  });
});

test('isPageExt', () => {
  const t = [
    { ext: '.tsx', expect: true },
    { ext: '.ts', expect: false },
    { ext: '.jsx', expect: true },
    { ext: '.js', expect: false },
    { ext: '.md', expect: true },
    { ext: '.mdx', expect: true },
    { ext: '.css', expect: false },
    { ext: '.scss', expect: false },
    { ext: '.sass', expect: false },
  ];
  t.forEach((c) => {
    assert.equal(isPageExt(c.ext), c.expect, c.ext);
  });
});

test('isModuleExt', () => {
  const t = [
    { ext: '.tsx', expect: false },
    { ext: '.ts', expect: true },
    { ext: '.jsx', expect: false },
    { ext: '.js', expect: true },
    { ext: '.md', expect: false },
    { ext: '.mdx', expect: false },
    { ext: '.css', expect: false },
    { ext: '.scss', expect: false },
    { ext: '.sass', expect: false },
  ];
  t.forEach((c) => {
    assert.equal(isModuleExt(c.ext), c.expect, c.ext);
  });
});

test('isPageModuleExt', () => {
  const t = [
    { ext: '.tsx', expect: true },
    { ext: '.ts', expect: false },
    { ext: '.jsx', expect: true },
    { ext: '.js', expect: false },
    { ext: '.md', expect: false },
    { ext: '.mdx', expect: false },
    { ext: '.css', expect: false },
    { ext: '.scss', expect: false },
    { ext: '.sass', expect: false },
  ];
  t.forEach((c) => {
    assert.equal(isPageModuleExt(c.ext), c.expect, c.ext);
  });
});

test('isMarkdownExt', () => {
  const t = [
    { ext: '.tsx', expect: false },
    { ext: '.ts', expect: false },
    { ext: '.jsx', expect: false },
    { ext: '.js', expect: false },
    { ext: '.md', expect: true },
    { ext: '.mdx', expect: true },
    { ext: '.css', expect: false },
    { ext: '.scss', expect: false },
    { ext: '.sass', expect: false },
  ];
  t.forEach((c) => {
    assert.equal(isMarkdownExt(c.ext), c.expect, c.ext);
  });
});

test('isMenuFileName', () => {
  const t = [
    { name: 'menu.md', expect: true },
    { name: 'menu.mdx', expect: false },
    { name: 'menu.tsx', expect: false },
    { name: 'menu.ts', expect: false },
  ];
  t.forEach((c) => {
    assert.equal(isMenuFileName(c.name), c.expect, c.name);
  });
});

test('getExtension', () => {
  const t = [
    { name: 'file.md?qs', expect: '.md' },
    { name: 'file.md#hash', expect: '.md' },
    { name: 'file.md', expect: '.md' },
    { name: 'file.dot.dot.PnG ', expect: '.png' },
    { name: 'file.JSX', expect: '.jsx' },
    { name: 'file.d.ts', expect: '.d.ts' },
    { name: 'file.ts', expect: '.ts' },
    { name: 'C:\\path\\to\\file.tsx', expect: '.tsx' },
    { name: 'http://qwik.dev/index.mdx', expect: '.mdx' },
    { name: '?qs', expect: '' },
    { name: '#hash', expect: '' },
    { name: 'file', expect: '' },
    { name: '', expect: '' },
    { name: null, expect: '' },
    { name: undefined, expect: '' },
  ];
  t.forEach((c) => {
    assert.equal(getExtension(c.name!), c.expect, c.name!);
  });
});

test('removeExtension', () => {
  const t = [
    { name: 'file.dot.dot.PnG ', expect: 'file.dot.dot' },
    { name: 'file.JSX', expect: 'file' },
    { name: 'file.d.ts', expect: 'file' },
    { name: 'file.ts', expect: 'file' },
    { name: 'C:\\path\\to\\file.tsx', expect: 'C:\\path\\to\\file' },
    { name: 'http://qwik.dev/index.mdx', expect: 'http://qwik.dev/index' },
    { name: 'file', expect: 'file' },
    { name: '', expect: '' },
    { name: null, expect: '' },
    { name: undefined, expect: '' },
  ];
  t.forEach((c) => {
    assert.equal(removeExtension(c.name!), c.expect, c.name!);
  });
});

test('createFileId, Page dir/index.tsx', () => {
  const path = normalizePath(join(routesDir, 'docs', 'index.tsx'));
  const p = createFileId(routesDir, path, 'Route');
  assert.equal(p, 'DocsRoute');
});

test('createFileId, Page about-us.tsx', () => {
  const path = normalizePath(join(routesDir, 'about-us', 'index.tsx'));
  const p = createFileId(routesDir, path, 'Route');
  assert.equal(p, 'AboutusRoute');
});

test('createFileId, Endpoint, api/[user]/index.ts', () => {
  const path = normalizePath(join(routesDir, 'api', '[user]', 'index.ts'));
  const p = createFileId(routesDir, path, 'Route');
  assert.equal(p, 'ApiUserRoute');
});

test('createFileId, Endpoint, data.json.ts', () => {
  const path = normalizePath(join(routesDir, 'api', 'data.json', 'index.ts'));
  const p = createFileId(routesDir, path, 'Route');
  assert.equal(p, 'ApiDataRoute');
});

test('createFileId, Layout', () => {
  const path = normalizePath(join(routesDir, 'dashboard', 'settings', 'layout.tsx'));
  const p = createFileId(routesDir, path);
  assert.equal(p, 'DashboardSettingsLayout');
});

test('createFileId, Menu', () => {
  const path = normalizePath(join(routesDir, 'settings', 'menu.mdx'));
  const p = createFileId(routesDir, path);
  assert.equal(p, 'SettingsMenu');
});

[
  {
    dirPath: join(routesDir, '(a)', 'about', '(b)', 'info', '(c)'),
    basePathname: '/',
    trailingSlash: true,
    expect: '/about/info/',
  },
  {
    dirPath: join(routesDir, 'about'),
    basePathname: '/app/',
    trailingSlash: true,
    expect: '/app/about/',
  },
  {
    dirPath: join(routesDir, 'about'),
    basePathname: '/app/',
    trailingSlash: false,
    expect: '/app/about',
  },
  {
    dirPath: join(routesDir, 'about'),
    basePathname: '/',
    trailingSlash: true,
    expect: '/about/',
  },
  {
    dirPath: join(routesDir, 'about'),
    basePathname: '/',
    trailingSlash: false,
    expect: '/about',
  },
  {
    dirPath: routesDir,
    basePathname: '/',
    trailingSlash: false,
    expect: '/',
  },
  {
    dirPath: routesDir,
    basePathname: '/',
    trailingSlash: true,
    expect: '/',
  },
  {
    dirPath: routesDir,
    basePathname: '/app/',
    trailingSlash: false,
    expect: '/app/',
  },
  {
    dirPath: routesDir,
    basePathname: '/app/',
    trailingSlash: true,
    expect: '/app/',
  },
].forEach((t) => {
  test(`getPathnameFromDirPath, dirPath: ${basename(t.dirPath)}, basePathname: ${
    t.basePathname
  }`, () => {
    const opts: NormalizedPluginOptions = {
      routesDir,
      serverPluginsDir,
      basePathname: t.basePathname,
      trailingSlash: t.trailingSlash,
      mdxPlugins: {
        remarkGfm: true,
        rehypeSyntaxHighlight: true,
        rehypeAutolinkHeadings: true,
      },
      mdx: {},
      platform: {},
      rewriteRoutes: [],
    };
    const pathname = getPathnameFromDirPath(opts, t.dirPath);
    assert.equal(pathname, t.expect, t.dirPath);
  });
});

test('parseRouteIndexName', () => {
  const t = [
    {
      extlessName: 'index@layout@name',
      expect: { layoutName: 'layout@name', layoutStop: false },
    },
    {
      extlessName: 'index@layoutname!',
      expect: { layoutName: 'layoutname', layoutStop: true },
    },
    {
      extlessName: 'index@layoutname',
      expect: { layoutName: 'layoutname', layoutStop: false },
    },
    {
      extlessName: 'index!',
      expect: { layoutName: '', layoutStop: true },
    },
    {
      extlessName: 'index',
      expect: { layoutName: '', layoutStop: false },
    },
  ];

  t.forEach((c) => {
    const r = parseRouteIndexName(c.extlessName);
    assert.equal(r.layoutName, c.expect.layoutName, `${c.extlessName} layoutName`);
    assert.equal(r.layoutStop, c.expect.layoutStop, `${c.extlessName} layoutStop`);
  });
});

[
  {
    filePath: join(routesDir, 'dir', 'menu.md'),
    basePathname: '/basepath/',
    trailingSlash: true,
    expect: '/basepath/dir/',
  },
  {
    filePath: join(routesDir, 'dir', 'menu.md'),
    basePathname: '/basepath/',
    trailingSlash: false,
    expect: '/basepath/dir/',
  },
  {
    filePath: join(routesDir, 'menu.md'),
    basePathname: '/basepath/',
    trailingSlash: true,
    expect: '/basepath/',
  },
  {
    filePath: join(routesDir, 'menu.md'),
    basePathname: '/basepath/',
    trailingSlash: false,
    expect: '/basepath/',
  },
  {
    filePath: join(routesDir, 'dir', 'menu.md'),
    basePathname: '/',
    trailingSlash: true,
    expect: '/dir/',
  },
  {
    filePath: join(routesDir, 'dir', 'menu.md'),
    basePathname: '/',
    trailingSlash: false,
    expect: '/dir/',
  },
  {
    filePath: join(routesDir, 'menu.md'),
    basePathname: '/',
    trailingSlash: true,
    expect: '/',
  },
  {
    filePath: join(routesDir, 'menu.md'),
    basePathname: '/',
    trailingSlash: false,
    expect: '/',
  },
].forEach((t) => {
  test(`menu-${t.basePathname}-${t.trailingSlash}`, () => {
    const opts: NormalizedPluginOptions = {
      routesDir,
      serverPluginsDir,
      basePathname: t.basePathname,
      trailingSlash: t.trailingSlash,
      mdxPlugins: {
        remarkGfm: true,
        rehypeSyntaxHighlight: true,
        rehypeAutolinkHeadings: true,
      },
      mdx: {},
      platform: {},
      rewriteRoutes: [],
    };
    const pathname = getMenuPathname(opts, t.filePath);
    assert.equal(pathname, t.expect);
  });
});
