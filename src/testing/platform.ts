import { getPlatform, setPlatform } from '@builder.io/qwik';
import type { TestPlatform } from './types';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

export function setTestPlatform(document: any) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }

  const doc: Document = document;

  let queuePromise: Promise<any> | null;
  let queueResolve: ((value: any) => void) | null = null;
  let queueReject: ((value: any) => void) | null = null;
  let queuedRenderMarked: ((doc: Document) => Promise<any>) | null = null;

  const testPlatform: TestPlatform = {
    import: (url: string) => import(url),
    toPath: (url: URL) => {
      const normalizedUrl = new URL(String(url));
      normalizedUrl.hash = '';
      normalizedUrl.search = '';
      const path = fileURLToPath(String(normalizedUrl));
      const importPaths = [path, ...testExts.map((ext) => path + ext)];

      for (const importPath of importPaths) {
        if (existsSync(importPath)) {
          return importPath;
        }
      }

      throw new Error(`Unable to find path for import "${url}"`);
    },
    queueRender: (renderMarked) => {
      if (!queuePromise) {
        queuedRenderMarked = renderMarked;

        queuePromise = new Promise((resolve, reject) => {
          queueResolve = resolve;
          queueReject = reject;
        });
      }
      return queuePromise;
    },
    flush: async () => {
      await Promise.resolve();

      if (queuedRenderMarked) {
        try {
          const hosts = await queuedRenderMarked(doc);
          if (queueResolve) {
            queueResolve(hosts);
          }
        } catch (e) {
          if (queueReject) {
            queueReject(e);
          } else {
            // eslint-disable-next-line no-console
            console.error(e);
          }
        }
      }

      queuePromise = null;
      queuedRenderMarked = null;
      queueResolve = null;
      queueReject = null;
    },
  };

  setPlatform(doc, testPlatform);
}

export function getTestPlatform(document: any) {
  const testPlatform: TestPlatform = getPlatform(document) as any;
  if (!testPlatform) {
    throw new Error(`Test platform was not applied to the document`);
  }
  if (typeof testPlatform.flush !== 'function') {
    throw new Error(`Invalid Test platform applied to the document`);
  }
  return testPlatform;
}

const testExts = ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.jsx'];
