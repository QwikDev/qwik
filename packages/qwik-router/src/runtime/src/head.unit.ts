import { describe, it, expect } from 'vitest';
import { resolveHead } from './head';
import type { ContentModuleHead } from './types';

const endpoint = {} as any;
const routeLocation = {} as any;
const locale = 'en';
const defaults = {
  title: 'Default Title',
  meta: [{ key: 'desc', name: 'description', content: 'Default description' }],
  link: [{ key: 'css', rel: 'stylesheet', href: 'default.css' }],
};
const mergeHeads = (...modules: any[]) =>
  resolveHead(endpoint, routeLocation, modules.map((m) => ({ head: m })) as any, locale, defaults);

describe('resolveHead', () => {
  it('should merge contentModule properties correctly', () => {
    const baseModule: ContentModuleHead = {
      title: 'Base Title',
      meta: [{ key: 'desc', name: 'description', content: 'Base description' }],
      links: [{ key: 'css', rel: 'stylesheet', href: 'base.css' }],
    };

    const overrideModule: ContentModuleHead = {
      title: 'Override Title',
      meta: [{ key: 'keywords', content: 'override, test' }],
      links: [{ key: 'icon', rel: 'icon', href: 'favicon.ico' }],
    };

    const result = mergeHeads(baseModule, overrideModule);

    expect(result.title).toBe('Override Title');
    expect(result.meta).toEqual([
      { key: 'desc', name: 'description', content: 'Base description' },
      { key: 'keywords', content: 'override, test' },
    ]);
    expect(result.links).toEqual([
      { key: 'css', rel: 'stylesheet', href: 'base.css' },
      { key: 'icon', rel: 'icon', href: 'favicon.ico' },
    ]);
  });

  it('should handle missing override properties', () => {
    const baseModule: ContentModuleHead = {
      title: 'Base Title',
      meta: [{ key: 'desc', content: 'Base description' }],
    };

    const overrideModule: ContentModuleHead = {};

    const result = mergeHeads(baseModule, overrideModule);

    expect(result.title).toBe('Base Title');
    expect(result.meta).toEqual([{ key: 'desc', content: 'Base description' }]);
  });

  it('should handle missing base properties', () => {
    const baseModule: ContentModuleHead = {};

    const overrideModule: ContentModuleHead = {
      title: 'Override Title',
      meta: [{ key: 'keywords', content: 'override, test' }],
    };

    const result = mergeHeads(baseModule, overrideModule);

    expect(result.title).toBe('Override Title');
    expect(result.meta).toEqual([
      { key: 'desc', name: 'description', content: 'Default description' },
      { key: 'keywords', content: 'override, test' },
    ]);
  });

  it('should not mutate input objects', () => {
    const baseModule: ContentModuleHead = {
      title: 'Base Title',
      meta: [{ name: 'description', content: 'Base description' }],
    };

    const overrideModule: ContentModuleHead = {
      title: 'Override Title',
      meta: [{ name: 'keywords', content: 'override, test' }],
    };

    const baseCopy = JSON.parse(JSON.stringify(baseModule));
    const overrideCopy = JSON.parse(JSON.stringify(overrideModule));

    mergeHeads(baseModule, overrideModule);

    expect(baseModule).toEqual(baseCopy);
    expect(overrideModule).toEqual(overrideCopy);
  });
});

describe('resolveHead with functions', () => {
  it('should execute head functions in correct order and merge results', () => {
    const baseModule: ContentModuleHead = (props) => ({
      title: props.head.title + ' - My Site',
      meta: [{ key: 'desc', name: 'description', content: 'Base description' }],
    });

    const overrideModule: ContentModuleHead = (props) => ({
      title: 'Override Title',
      meta: [{ key: 'desc', name: 'description', content: 'will be overridden' }],
    });

    const result = mergeHeads(baseModule, overrideModule);

    expect(result.title).toBe('Override Title - My Site');
    expect(result.meta).toEqual([
      { key: 'desc', name: 'description', content: 'Base description' },
    ]);
  });

  it('should handle mix of object and function heads', () => {
    const objectModule: ContentModuleHead = {
      title: 'Object Title',
      meta: [{ key: 'desc', name: 'description', content: 'Object description' }],
    };

    const functionModule: ContentModuleHead = (props) => ({
      title: props.head.title + ' - My Site',
      meta: [{ key: 'keywords', content: 'function, test' }],
    });

    const result = mergeHeads(objectModule, functionModule);

    expect(result.title).toBe('Object Title - My Site');
    expect(result.meta).toEqual([
      { key: 'desc', name: 'description', content: 'Object description' },
      { key: 'keywords', content: 'function, test' },
    ]);
  });
});
