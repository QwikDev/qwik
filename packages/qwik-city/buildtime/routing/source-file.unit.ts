import { assert, test } from 'vitest';
import { getSourceFile } from './source-file';

[
  {
    fileName: '404.md',
    expect: {
      type: 'route',
      extlessName: '404',
      ext: '.md',
    },
  },
  {
    fileName: '404.tsx',
    expect: {
      type: 'route',
      extlessName: '404',
      ext: '.tsx',
    },
  },
  {
    fileName: '500.tsx',
    expect: {
      type: 'route',
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
    fileName: 'service-worker.ts',
    expect: {
      type: 'service-worker',
      extlessName: 'service-worker',
      ext: '.ts',
    },
  },
  {
    fileName: 'service-worker.js',
    expect: {
      type: 'service-worker',
      extlessName: 'service-worker',
      ext: '.js',
    },
  },
  {
    fileName: 'service-worker.tsx',
    expect: null,
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
    fileName: 'layout@name.jsx',
    expect: null,
  },
  {
    fileName: 'layout!.jsx',
    expect: {
      type: 'layout',
      extlessName: 'layout!',
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
    fileName: 'layout.css',
    expect: null,
  },
  {
    fileName: 'index.css',
    expect: null,
  },
  {
    fileName: 'index.css.ts',
    expect: null,
  },
  {
    fileName: 'index.scss.ts',
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
  {
    fileName: 'index.d.ts',
    expect: null,
  },
].forEach((t) => {
  test(`getSourceFile ${t.fileName}`, () => {
    const s = getSourceFile(t.fileName);
    if (s == null || t.expect == null) {
      assert.equal(s, t.expect, t.fileName);
    } else {
      assert.equal(s.type, t.expect.type, t.fileName);
      assert.equal(s.extlessName, t.expect.extlessName, t.fileName);
      assert.equal(s.ext, t.expect.ext, t.fileName);
    }
  });
});
