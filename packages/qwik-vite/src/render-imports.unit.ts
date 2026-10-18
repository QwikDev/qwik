import { parseAst } from 'vite';
import { expect, test } from 'vitest';
import { collectRenderImports } from './render-imports';
import type { QwikManifest } from './types';

const analyze = (
  sources: Record<string, { code: string; exports?: string[] }>,
  roots: Record<string, string>,
  contexts: Record<string, string> = {}
) => {
  const chunks = new Map(
    Object.entries(sources).map(([fileName, source]) => [
      fileName,
      { type: 'chunk', fileName, exports: source.exports || [], code: source.code },
    ])
  );
  const manifest = {
    mapping: roots,
    symbols: Object.fromEntries(
      Object.keys(roots).map((name) => [
        name,
        { ctxKind: 'function', ctxName: contexts[name] || 'component$' },
      ])
    ),
  } as QwikManifest;
  return collectRenderImports(chunks as any, manifest, parseAst);
};
const shared = `const Modal=componentQrl(qrl(()=>import('./modal.js'),'s_modal'));
  const Title=componentQrl(qrl(()=>import('./title.js'),'s_title'));
  const Gallery=componentQrl(qrl(()=>import('./gallery.js'),'s_gallery'));
  export {Modal,Title,Gallery};`;
const mapping = {
  s_root: 'page.js',
  s_modal: 'modal.js',
  s_gallery: 'gallery.js',
  s_title: 'title.js',
};

test('orders component dependencies by use in the QRL body', () => {
  const result = analyze(
    {
      'page.js': {
        code: `import{Gallery,Title,Modal}from'./shared.js';const render=()=>[Gallery(),Title(),Modal()];export{render as s_root};`,
        exports: ['s_root'],
      },
      'shared.js': { code: shared, exports: ['Modal', 'Title', 'Gallery'] },
    },
    mapping
  );
  expect(result.get('page.js')).toEqual(['gallery.js', 'title.js', 'modal.js']);
  expect(result.get('shared.js')).toEqual([]);
});

test('ignores unused exports, property names and shadowed bindings', () => {
  const result = analyze(
    {
      'page.js': {
        code: `import{Gallery,Modal,Title}from'./shared.js';function render(Modal){const x={Title:1};return Gallery(x,Modal)}export{render as s_root};`,
        exports: ['s_root'],
      },
      'shared.js': { code: shared, exports: ['Modal', 'Title', 'Gallery'] },
    },
    mapping
  );
  expect(result.get('page.js')).toEqual(['gallery.js']);
});

test('follows re-exports and cyclic helper bindings', () => {
  const result = analyze(
    {
      'page.js': {
        code: `import{Photo}from'./barrel.js';function first(){return second()}function second(){return [first,Photo]}export{first as s_root};`,
        exports: ['s_root'],
      },
      'barrel.js': { code: `export{Gallery as Photo}from'./shared.js';`, exports: ['Photo'] },
      'shared.js': { code: shared, exports: ['Gallery'] },
    },
    mapping
  );
  expect(result.get('page.js')).toEqual(['gallery.js']);
});

test('prepares owned computations without following future handlers or raw imports', () => {
  const result = analyze(
    {
      'page.js': {
        code: `const compute=qrl(()=>import('./compute.js'),\`s_compute\`);const click=qrl(()=>import('./click.js'),'s_click');const render=()=>[compute,click,()=>import('./library.js')];export{render as s_root};`,
        exports: ['s_root'],
      },
    },
    { s_root: 'page.js', s_compute: 'compute.js', s_click: 'click.js' },
    { s_compute: 'useComputed$', s_click: '$' }
  );
  expect(result.get('page.js')).toEqual(['compute.js']);
});

test('keeps scope resolution stable after importer arrow functions', () => {
  const result = analyze(
    {
      'page.js': {
        code: `import{Gallery,Modal}from'./shared.js';const setup=qrl(()=>import('./setup.js'),'s_setup');function render(Modal){return [setup,Gallery(Modal)]}export{render as s_root};`,
        exports: ['s_root'],
      },
      'shared.js': { code: shared, exports: ['Gallery', 'Modal'] },
    },
    { ...mapping, s_setup: 'setup.js' },
    { s_setup: 'useTask$' }
  );
  expect(result.get('page.js')).toEqual(['setup.js', 'gallery.js']);
});

test('follows default exports, star re-exports and destructured module bindings', () => {
  const result = analyze(
    {
      'page.js': {
        code: `import{Gallery}from'./barrel.js';const{chosen}= {chosen:Gallery};export const s_root=()=>chosen();`,
        exports: ['s_root'],
      },
      'barrel.js': {
        code: `export{default as Gallery}from'./default.js';export * from './shared.js';`,
        exports: ['Gallery'],
      },
      'default.js': {
        code: `import{Gallery}from'./shared.js';export default Gallery;`,
        exports: ['default'],
      },
      'shared.js': { code: shared, exports: ['Gallery'] },
    },
    mapping
  );
  expect(result.get('page.js')).toEqual(['gallery.js']);
});

test('resolves named default functions referenced by another export', () => {
  const result = analyze(
    {
      'page.js': {
        code: `import{Gallery}from'./shared.js';export default function factory(){return Gallery}export const s_root=()=>factory();`,
        exports: ['default', 's_root'],
      },
      'shared.js': { code: shared, exports: ['Gallery'] },
    },
    mapping
  );
  expect(result.get('page.js')).toEqual(['gallery.js']);
});
