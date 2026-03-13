import { describe, it, expect } from 'vitest';
import { resolveHead, resolveRouteConfig } from './head';
import type { ContentModuleHead, ContentModule } from './types';

const endpoint = {} as any;
const routeLocation = {} as any;
const resolveValue = (() => {}) as any;
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

describe('resolveRouteConfig', () => {
  const makeModules = (...mods: Partial<ContentModule>[]): ContentModule[] =>
    mods as ContentModule[];

  it('should resolve routeConfig object with head', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules({
        routeConfig: {
          head: { title: 'Route Config Title' },
        },
      }),
      locale
    );
    expect(config.head.title).toBe('Route Config Title');
  });

  it('should resolve routeConfig with eTag and cacheKey', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules({
        routeConfig: {
          head: { title: 'Test' },
          eTag: 'abc123',
          cacheKey: true,
        },
      }),
      locale
    );
    expect(config.head.title).toBe('Test');
    expect(config.eTag).toBe('abc123');
    expect(config.cacheKey).toBe(true);
  });

  it('should ignore separate head/eTag/cacheKey when routeConfig is present', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules({
        routeConfig: {
          head: { title: 'From RouteConfig' },
          eTag: 'config-etag',
        },
        head: { title: 'Standalone Head' },
        eTag: 'standalone-etag',
      } as any),
      locale
    );
    expect(config.head.title).toBe('From RouteConfig');
    expect(config.eTag).toBe('config-etag');
  });

  it('should fall back to separate exports when no routeConfig', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules({
        head: { title: 'Standalone' },
        eTag: 'standalone-etag',
        cacheKey: true,
      } as any),
      locale
    );
    expect(config.head.title).toBe('Standalone');
    expect(config.eTag).toBe('standalone-etag');
    expect(config.cacheKey).toBe(true);
  });

  it('should resolve routeConfig function', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules({
        routeConfig: (props) => ({
          head: { title: 'Dynamic Title' },
          eTag: 'dynamic-etag',
        }),
      }),
      locale
    );
    expect(config.head.title).toBe('Dynamic Title');
    expect(config.eTag).toBe('dynamic-etag');
  });

  it('should allow layout to define eTag/cacheKey for subtree', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules(
        // Layout
        {
          routeConfig: {
            head: { title: 'Layout Title' },
            eTag: 'layout-etag',
            cacheKey: true,
          },
        },
        // Page (no eTag override)
        {
          routeConfig: {
            head: { title: 'Page Title' },
          },
        }
      ),
      locale
    );
    // Page title overrides layout
    expect(config.head.title).toBe('Page Title');
    // Layout eTag persists since page didn't override
    expect(config.eTag).toBe('layout-etag');
    expect(config.cacheKey).toBe(true);
  });

  it('should allow page to override layout eTag/cacheKey', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules(
        // Layout
        {
          routeConfig: {
            eTag: 'layout-etag',
            cacheKey: true,
          },
        },
        // Page overrides
        {
          routeConfig: {
            head: { title: 'Page' },
            eTag: 'page-etag',
          },
        }
      ),
      locale
    );
    expect(config.eTag).toBe('page-etag');
    // cacheKey from layout persists since page didn't set it
    expect(config.cacheKey).toBe(true);
  });

  it('should handle mixed routeConfig and standalone exports across modules', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules(
        // Layout with standalone head
        { head: { title: 'Layout' } },
        // Page with routeConfig
        {
          routeConfig: {
            head: { title: 'Page' },
            eTag: 'page-etag',
          },
        }
      ),
      locale
    );
    expect(config.head.title).toBe('Page');
    expect(config.eTag).toBe('page-etag');
  });

  it('should handle routeConfig functions with inner-before-outer execution', () => {
    const config = resolveRouteConfig(
      resolveValue,
      routeLocation,
      makeModules(
        // Layout function (executes second)
        {
          routeConfig: (props) => ({
            head: { title: props.head.title + ' | Site' },
          }),
        },
        // Page function (executes first)
        {
          routeConfig: (props) => ({
            head: { title: 'Page Title' },
            eTag: 'page-etag',
          }),
        }
      ),
      locale
    );
    // Page sets title, layout appends
    expect(config.head.title).toBe('Page Title | Site');
    expect(config.eTag).toBe('page-etag');
  });
});
