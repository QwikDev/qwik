import type { QwikManifest } from '../types';

const QWIK_WORKER_QRL_SENTINEL_NAME = '__QWIK_WORKER_QRL__';
export const QWIK_WORKER_QRL_SENTINEL = `${QWIK_WORKER_QRL_SENTINEL_NAME}:`;

const QWIK_WORKER_QRL_RE = new RegExp(`${QWIK_WORKER_QRL_SENTINEL}([^"'\\\`\\s]+)`, 'g');

const normalizeChunkPathPrefix = (prefix: string) => {
  if (!prefix) {
    return '';
  }
  return `${prefix.replace(/\/+$/, '')}/`;
};

export const getChunkPathPrefix = (prefix: string) => {
  return `${normalizeChunkPathPrefix(prefix)}build/`;
};

const joinPublicPath = (basePathname: string, fileName: string) => {
  const base = basePathname.endsWith('/') ? basePathname : `${basePathname}/`;
  return `${base}${fileName}`.replace(/\/{2,}/g, '/');
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

export const createDevWorkerQrlChunkResolver = (
  basePathname: string,
  assetsDir: string | undefined
) => {
  const chunkPathPrefix = getChunkPathPrefix(assetsDir ?? '');

  return (importPath: string) => {
    const [, relativeFilePath = '', suffix = ''] = /^([^?#]*)(.*)$/.exec(importPath) ?? [];
    const canonicalFilename = relativeFilePath
      .replace(/^\.\//, '')
      .replace(/\.[^./?]+(?:\?.*)?$/, '');
    return `${joinPublicPath(basePathname, `${chunkPathPrefix}${canonicalFilename}.js`)}${suffix}`;
  };
};

export const deriveBasePathnameFromDevPath = (
  devPath: string | undefined,
  rootDir: string | undefined,
  pathId: string
) => {
  if (!devPath || !rootDir) {
    return '/';
  }

  const normalizedRootDir = rootDir.replace(/\\/g, '/');
  const normalizedPathId = pathId.replace(/\\/g, '/');
  if (!normalizedPathId.startsWith(normalizedRootDir)) {
    return '/';
  }

  const relativePath = normalizedPathId.slice(normalizedRootDir.length).replace(/^\/+/, '');
  if (!relativePath || !devPath.endsWith(relativePath)) {
    return '/';
  }

  const basePathname = devPath.slice(0, devPath.length - relativePath.length) || '/';
  return basePathname.endsWith('/') ? basePathname : `${basePathname}/`;
};
