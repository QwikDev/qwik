import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _setRouterConfig,
  getBasePathname,
  getRouterConfig,
  getRoutes,
  getTrailingSlash,
} from './router-config';
import type { QwikRouterConfig } from './types';

describe('router config getters', () => {
  beforeEach(() => {
    _setRouterConfig(undefined as unknown as QwikRouterConfig);
  });

  it('serves the registered config and its sections', async () => {
    const routes = { _I: async () => ({}) } as any;
    _setRouterConfig({ routes, basePathname: '/app/', trailingSlash: false });

    expect(await getRouterConfig()).toMatchObject({ routes });
    expect(await getRoutes()).toBe(routes);
    expect(getBasePathname()).toBe('/app/');
    expect(getTrailingSlash()).toBe(false);
  });

  it('registers the server$ modules once before resolving', async () => {
    const importEagerModules = vi.fn(async () => {});
    _setRouterConfig({ routes: {}, importEagerModules });

    await Promise.all([getRouterConfig(), getRouterConfig()]);
    await getRoutes();

    expect(importEagerModules).toHaveBeenCalledTimes(1);
  });

  it('registers the eager modules of a replaced config again', async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    _setRouterConfig({ routes: {}, importEagerModules: first });
    await getRouterConfig();
    _setRouterConfig({ routes: {}, importEagerModules: second });
    await getRouterConfig();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('falls back to the build-time defaults without a config', () => {
    expect(getBasePathname()).toBe('/');
    expect(getTrailingSlash()).toBe(true);
  });

  it('imports the config when the server entry did not register it', async () => {
    expect(await getRouterConfig()).toHaveProperty('routes');
  });

  it('reports a config the build cannot resolve, and tries again next time', async () => {
    vi.doMock('@qwik-router-config', () => {
      throw new Error('outside the app build');
    });
    try {
      await expect(getRouterConfig()).rejects.toThrow(/Import "@qwik-router-config"/);
    } finally {
      vi.doUnmock('@qwik-router-config');
    }
    expect(await getRouterConfig()).toHaveProperty('routes');
  });
});
