import { describe, expect, it, vi } from 'vitest';
import {
  getImportMetaDirUrl,
  getNodeDistUrl,
  getNodeWorkerQrlBaseUrlFromDist,
  getNodeWorkerUrlFromDist,
  getPublicBuildPath,
} from './worker-runtime-node-paths';

describe('worker runtime node path helpers', () => {
  it('does not try to walk relative URLs from data module urls', () => {
    const existsSync = vi.fn();

    expect(
      getNodeDistUrl(
        'data:video/mp2t;base64,LyoqIEBwYWNrYWdlRG9jdW1lbnRhdGlvbiAqLwoKZXhwb3J0ICogZnJvbSAnLi93b3JrZXItcXJsJzsK',
        { existsSync }
      )
    ).toBeNull();
    expect(existsSync).not.toHaveBeenCalled();
  });

  it('finds the nearest dist directory from a file module url', () => {
    const existsSync = vi.fn((path: string | URL) => {
      return String(path).endsWith('/apps/e2e/dist/');
    });

    const distUrl = getNodeDistUrl('file:///C:/repo/e2e/qwik-e2e/apps/e2e/server/entry.ssr.js', {
      existsSync,
    });

    expect(distUrl?.href).toBe('file:///C:/repo/e2e/qwik-e2e/apps/e2e/dist/');
  });

  it('maps public worker assets back into dist assets and build urls', () => {
    const distUrl = new URL('file:///C:/repo/e2e/qwik-e2e/apps/e2e/dist/');

    expect(getPublicBuildPath('/e2e/assets/worker.node-abc123.js')).toBe('/e2e/build/');
    expect(getNodeWorkerUrlFromDist('/e2e/assets/worker.node-abc123.js', distUrl).href).toBe(
      'file:///C:/repo/e2e/qwik-e2e/apps/e2e/dist/e2e/assets/worker.node-abc123.js'
    );
    expect(
      getNodeWorkerQrlBaseUrlFromDist('/e2e/assets/worker.node-abc123.js', distUrl)?.href
    ).toBe('file:///C:/repo/e2e/qwik-e2e/apps/e2e/dist/e2e/build/');
  });

  it('derives the containing directory from file module urls only', () => {
    expect(getImportMetaDirUrl('file:///C:/repo/app/server/entry.ssr.js')?.href).toBe(
      'file:///C:/repo/app/server/'
    );
    expect(getImportMetaDirUrl('data:text/javascript,export{}')).toBeNull();
  });
});
