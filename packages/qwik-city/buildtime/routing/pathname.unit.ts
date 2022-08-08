import { test } from 'uvu';
import { equal } from 'uvu/assert';
import {
  getMenuLinkHref,
  getPathnameFromDirPath,
  normalizePathname,
  parseRouteIndexName,
} from './pathname';
import type { NormalizedPluginOptions } from '../types';
import { tmpdir } from 'os';
import { join } from 'path';

test('getPathnameFromDirPath', () => {
  const routesDir = tmpdir();

  const t = [
    {
      dirPath: join(routesDir, '__a', 'about', '__b', 'info', '__c'),
      baseUrl: '/',
      trailingSlash: true,
      expect: '/about/info/',
    },
    {
      dirPath: join(routesDir, 'about'),
      baseUrl: '/app/',
      trailingSlash: true,
      expect: '/app/about/',
    },
    {
      dirPath: join(routesDir, 'about'),
      baseUrl: '/app/',
      trailingSlash: false,
      expect: '/app/about',
    },
    {
      dirPath: join(routesDir, 'about'),
      baseUrl: '/',
      trailingSlash: true,
      expect: '/about/',
    },
    {
      dirPath: join(routesDir, 'about'),
      baseUrl: '/',
      trailingSlash: false,
      expect: '/about',
    },
    {
      dirPath: routesDir,
      baseUrl: '/',
      trailingSlash: false,
      expect: '/',
    },
    {
      dirPath: routesDir,
      baseUrl: '/',
      trailingSlash: true,
      expect: '/',
    },
    {
      dirPath: routesDir,
      baseUrl: '/app/',
      trailingSlash: false,
      expect: '/app',
    },
    {
      dirPath: routesDir,
      baseUrl: '/app/',
      trailingSlash: true,
      expect: '/app/',
    },
  ];

  t.forEach((c) => {
    const opts: NormalizedPluginOptions = {
      routesDir: routesDir,
      baseUrl: c.baseUrl,
      trailingSlash: c.trailingSlash,
      mdx: {},
    };
    const pathname = getPathnameFromDirPath(opts, c.dirPath);
    equal(pathname, c.expect, c.dirPath);
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
    equal(r.layoutName, c.expect.layoutName, `${c.extlessName} layoutName`);
    equal(r.layoutStop, c.expect.layoutStop, `${c.extlessName} layoutStop`);
  });
});

test('normalizePathname', () => {
  const routesDir = tmpdir();
  const menuFilePath = join(routesDir, 'docs', 'menu.md');

  const t = [
    {
      href: './getting-started/index.mdx',
      expect: '/docs/getting-started',
    },
    {
      href: './getting-started/index.mdx?intro',
      expect: '/docs/getting-started?intro',
    },
    {
      href: './getting-started/index.mdx#intro',
      expect: '/docs/getting-started#intro',
    },
    {
      href: '/link',
      expect: '/link',
    },
    {
      href: 'http://builder.io/',
      expect: 'http://builder.io/',
    },
    {
      href: './getting-started.txt',
      expect: './getting-started.txt',
    },
  ];

  t.forEach((c) => {
    const opts: NormalizedPluginOptions = {
      baseUrl: '/',
      trailingSlash: false,
      routesDir: routesDir,
      mdx: {},
    };
    equal(getMenuLinkHref(opts, menuFilePath, c.href), c.expect);
  });
});

test('normalizePathname', () => {
  const t = [
    {
      pathname: '/name/',
      baseUrl: '/',
      trailingSlash: true,
      expect: '/name/',
    },
    {
      pathname: '/name',
      baseUrl: '/',
      trailingSlash: true,
      expect: '/name/',
    },
    {
      pathname: '/name/',
      baseUrl: '/',
      trailingSlash: false,
      expect: '/name',
    },
    {
      pathname: '/name',
      baseUrl: '/',
      trailingSlash: false,
      expect: '/name',
    },
    {
      pathname: 'plz no spaces',
      baseUrl: '/',
      trailingSlash: false,
      expect: '/plz%20no%20spaces',
    },
    {
      pathname: './about',
      baseUrl: '/',
      trailingSlash: false,
      expect: '/about',
    },
    {
      pathname: '/about',
      baseUrl: '/app/',
      trailingSlash: false,
      expect: '/app/about',
    },
    {
      pathname: '/about',
      baseUrl: '/app/',
      trailingSlash: true,
      expect: '/app/about/',
    },
    {
      pathname: '/',
      baseUrl: '/app/',
      trailingSlash: false,
      expect: '/app',
    },
    {
      pathname: '/',
      baseUrl: '/app/',
      trailingSlash: true,
      expect: '/app/',
    },
    {
      pathname: '/',
      baseUrl: '/',
      trailingSlash: false,
      expect: '/',
    },
    {
      pathname: '/',
      baseUrl: '/',
      trailingSlash: true,
      expect: '/',
    },
  ];

  t.forEach((c) => {
    const opts: NormalizedPluginOptions = {
      baseUrl: c.baseUrl,
      trailingSlash: c.trailingSlash,
      routesDir: '',
      mdx: {},
    };
    equal(normalizePathname(opts, c.pathname), c.expect);
  });
});

test.run();
