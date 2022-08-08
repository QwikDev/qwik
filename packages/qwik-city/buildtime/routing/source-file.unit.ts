import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { getSourceFile } from './source-file';

test(`getSourceFile`, () => {
  const t = [
    {
      fileName: '404.md',
      expect: {
        type: 'error',
        extlessName: '404',
        ext: '.md',
      },
    },
    {
      fileName: '404.tsx',
      expect: {
        type: 'error',
        extlessName: '404',
        ext: '.tsx',
      },
    },
    {
      fileName: '500.tsx',
      expect: {
        type: 'error',
        extlessName: '500',
        ext: '.tsx',
      },
    },
    {
      fileName: 'entry.md',
      expect: null,
    },
    {
      fileName: 'entry.ts',
      expect: {
        type: 'entry',
        extlessName: 'entry',
        ext: '.ts',
      },
    },
    {
      fileName: 'menu.md',
      expect: {
        type: 'menu',
        extlessName: 'menu',
        ext: '.md',
      },
    },
    {
      fileName: 'menu.mdx',
      expect: null,
    },
    {
      fileName: 'menu.tsx',
      expect: null,
    },
    {
      fileName: 'layout-name!.jsx',
      expect: {
        type: 'layout',
        extlessName: 'layout-name!',
        ext: '.jsx',
      },
    },
    {
      fileName: 'layout-name.jsx',
      expect: {
        type: 'layout',
        extlessName: 'layout-name',
        ext: '.jsx',
      },
    },
    {
      fileName: 'layout.jsx',
      expect: {
        type: 'layout',
        extlessName: 'layout',
        ext: '.jsx',
      },
    },
    {
      fileName: 'layout!.js',
      expect: {
        type: 'layout',
        extlessName: 'layout!',
        ext: '.js',
      },
    },
    {
      fileName: 'layout.js',
      expect: {
        type: 'layout',
        extlessName: 'layout',
        ext: '.js',
      },
    },
    {
      fileName: 'layou.css',
      expect: null,
    },
    {
      fileName: 'index.css',
      expect: null,
    },
    {
      fileName: 'index.tsx.json',
      expect: null,
    },
    {
      fileName: 'index.mdx',
      expect: {
        type: 'route',
        extlessName: 'index',
        ext: '.mdx',
      },
    },
    {
      fileName: 'index.md',
      expect: {
        type: 'route',
        extlessName: 'index',
        ext: '.md',
      },
    },
    {
      fileName: 'index.ts',
      expect: {
        type: 'route',
        extlessName: 'index',
        ext: '.ts',
      },
    },
    {
      fileName: 'index@layoutname!.tsx',
      expect: {
        type: 'route',
        extlessName: 'index@layoutname!',
        ext: '.tsx',
      },
    },
    {
      fileName: 'index@layoutname.tsx',
      expect: {
        type: 'route',
        extlessName: 'index@layoutname',
        ext: '.tsx',
      },
    },
    {
      fileName: 'index!.tsx',
      expect: {
        type: 'route',
        extlessName: 'index!',
        ext: '.tsx',
      },
    },
    {
      fileName: 'index.tsx',
      expect: {
        type: 'route',
        extlessName: 'index',
        ext: '.tsx',
      },
    },
  ];

  t.forEach((c) => {
    const s = getSourceFile(c.fileName);
    if (s == null || c.expect == null) {
      equal(s, c.expect, c.fileName);
    } else {
      equal(s.type, c.expect.type, c.fileName);
      equal(s.extlessName, c.expect.extlessName, c.fileName);
      equal(s.ext, c.expect.ext, c.fileName);
    }
  });
});

test.run();
