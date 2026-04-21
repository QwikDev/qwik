import type { QwikManifest } from '../types';

const QWIK_WORKER_QRL_SENTINEL_NAME = '__QWIK_WORKER_QRL__';
export const QWIK_WORKER_QRL_SENTINEL = `${QWIK_WORKER_QRL_SENTINEL_NAME}:`;

const QWIK_WORKER_QRL_RE = new RegExp(`${QWIK_WORKER_QRL_SENTINEL}([^"'\\\`\\s]+)`, 'g');

const joinPublicPath = (basePathname: string, fileName: string) => {
  const base = basePathname.endsWith('/') ? basePathname : `${basePathname}/`;
  return `${base}${fileName}`.replace(/\/{2,}/g, '/');
};

const posixDirname = (path: string) => {
  const normalized = path.replace(/\/+$/, '');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex === -1) {
    return '.';
  }
  if (slashIndex === 0) {
    return '/';
  }
  return normalized.slice(0, slashIndex);
};

const resolveBuildChunkPublicPath = (basePathname: string, fileName: string) => {
  const normalizedFileName = fileName.replace(/^\.\//, '');
  if (
    normalizedFileName === 'build' ||
    normalizedFileName.startsWith('build/') ||
    (!normalizedFileName.startsWith('../') && /^[^./][^?]*\/build\//.test(normalizedFileName))
  ) {
    return joinPublicPath(basePathname, normalizedFileName);
  }

  return new URL(normalizedFileName, `https://qwik.dev${joinPublicPath(basePathname, 'build/')}`)
    .pathname;
};

export const rewriteWorkerQrlChunkPlaceholders = (
  code: string,
  resolveChunkPath: (importPath: string) => string | undefined
) => {
  return code.replace(QWIK_WORKER_QRL_RE, (match, importPath: string) => {
    return resolveChunkPath(importPath) ?? match;
  });
};

export const createBuildWorkerQrlChunkResolver = (manifest: QwikManifest, basePathname: string) => {
  const bundleByCanonicalFilename = new Map<string, string>();
  for (const [symbolName, symbol] of Object.entries(manifest.symbols)) {
    const bundleFileName = manifest.mapping[symbolName];
    if (bundleFileName) {
      bundleByCanonicalFilename.set(
        symbol.canonicalFilename,
        resolveBuildChunkPublicPath(basePathname, bundleFileName)
      );
    }
  }

  return (importPath: string) => {
    return bundleByCanonicalFilename.get(
      importPath.replace(/^\.\//, '').replace(/\.[^./?]+(?:\?.*)?$/, '')
    );
  };
};

export const createDevWorkerQrlChunkResolver = (devPath: string) => {
  const normalizedDevPath = devPath.replace(/\\/g, '/');
  const parentDir = posixDirname(normalizedDevPath);

  return (importPath: string) => {
    const [, relativeFilePath = '', suffix = ''] = /^([^?#]*)(.*)$/.exec(importPath) ?? [];
    const canonicalFilename = relativeFilePath
      .replace(/^\.\//, '')
      .replace(/\.[^./?]+(?:\?.*)?$/, '');
    const basePath = joinPublicPath(parentDir, `${canonicalFilename}.js`);
    if (suffix.startsWith('?')) {
      return `${basePath}?worker_file&type=module&${suffix.slice(1)}`;
    }
    if (suffix.startsWith('#')) {
      return `${basePath}?worker_file&type=module${suffix}`;
    }
    return `${basePath}?worker_file&type=module`;
  };
};
