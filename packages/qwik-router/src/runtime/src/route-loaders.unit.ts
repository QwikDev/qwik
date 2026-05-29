import { describe, expect, it, vi } from 'vitest';
import { loadRouteLoader, routeLoaderQrl } from './route-loaders';
import type { LoaderInternal } from './types';

describe('route loader execution', () => {
  it('memoizes in-flight loader executions on the request', async () => {
    const requestEv: any = {
      sharedMap: new Map(),
    };

    const parentLoader = createLoader('parent', async () => 'parent-value');
    const childLoader = createLoader('child', async (_thisArg, ev) => {
      const value = await ev.resolveValue(parentLoader);
      return `child:${value}`;
    });

    requestEv.resolveValue = (loader: LoaderInternal) => loadRouteLoader(loader, requestEv);

    await expect(
      Promise.all([
        loadRouteLoader(parentLoader, requestEv),
        loadRouteLoader(childLoader, requestEv),
      ])
    ).resolves.toEqual(['parent-value', 'child:parent-value']);
    expect(parentLoader.__qrl.call).toHaveBeenCalledOnce();
  });

  it('stores loader expires values in milliseconds', () => {
    const loader = routeLoaderQrl(createQrl('timed-loader'), { expires: 60_000 }) as LoaderInternal;

    expect(loader.__expires).toBe(60_000);
  });
});

function createLoader(id: string, fn: (thisArg: unknown, ev: any) => unknown): LoaderInternal {
  return {
    __brand: 'server_loader',
    __id: id,
    __qrl: createQrl(id, fn),
    __validators: undefined,
    __serializationStrategy: 'never',
    __expires: 0,
    __poll: false,
    __eTag: undefined,
    __search: undefined,
    __allowStale: true,
  } as any;
}

function createQrl(id: string, fn: (thisArg: unknown, ev: any) => unknown = async () => undefined) {
  return {
    call: vi.fn(fn),
    getHash: () => id,
    getSymbol: () => id,
  } as any;
}
