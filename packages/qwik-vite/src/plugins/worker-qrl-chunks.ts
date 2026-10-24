import type { Rolldown } from 'vite';
import type { QwikManifest } from '../types';

const QWIK_WORKER_QRL_SENTINEL_NAME = '__QWIK_WORKER_QRL__';
export const QWIK_WORKER_QRL_SENTINEL = `${QWIK_WORKER_QRL_SENTINEL_NAME}:`;
export const QWIK_WORKER_CORE_SENTINEL = '__QWIK_WORKER_CORE__';

// Exclude backslash so escaped quotes (\") in string literals end the match.
const QWIK_WORKER_QRL_RE = new RegExp(`${QWIK_WORKER_QRL_SENTINEL}([^"'\\\`\\s\\\\]+)`, 'g');

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

const resolveBuildChunkRelativePath = (fileName: string) => {
  return resolveBuildChunkPublicPath('/', fileName).replace(/^\//, '');
};

const createManifestWorkerQrlChunkResolver = (
  manifest: QwikManifest,
  resolveBundleFileName: (fileName: string) => string
) => {
  const bundleByCanonicalFilename = new Map<string, string>();
  for (const [symbolName, symbol] of Object.entries(manifest.symbols)) {
    const bundleFileName = manifest.mapping[symbolName];
    if (bundleFileName) {
      bundleByCanonicalFilename.set(
        symbol.canonicalFilename,
        resolveBundleFileName(bundleFileName)
      );
    }
  }

  return (importPath: string) => {
    return bundleByCanonicalFilename.get(
      importPath.replace(/^\.\//, '').replace(/\.[^./?]+(?:\?.*)?$/, '')
    );
  };
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
  return createManifestWorkerQrlChunkResolver(manifest, (fileName) =>
    resolveBuildChunkPublicPath(basePathname, fileName)
  );
};

export const createRelativeBuildWorkerQrlChunkResolver = (manifest: QwikManifest) => {
  return createManifestWorkerQrlChunkResolver(manifest, resolveBuildChunkRelativePath);
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

const ensureRelativeImportPath = (fileName: string) => {
  return fileName.startsWith('.') ? fileName : `./${fileName}`;
};

const normalizePosixPathParts = (path: string) => {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts;
};

const relativePosixPath = (fromDir: string, toFile: string) => {
  const fromParts = fromDir === '.' ? [] : normalizePosixPathParts(fromDir);
  const toParts = normalizePosixPathParts(toFile);
  let sharedParts = 0;
  while (
    sharedParts < fromParts.length &&
    sharedParts < toParts.length &&
    fromParts[sharedParts] === toParts[sharedParts]
  ) {
    sharedParts++;
  }

  return [...fromParts.slice(sharedParts).map(() => '..'), ...toParts.slice(sharedParts)].join('/');
};

const EMPTY_MODULE_EXPRESSION = 'Promise.resolve({})';

interface AstNode {
  type?: string;
  start: number;
  end: number;
  [key: string]: any;
}

const findImportExpressions = (node: unknown, found: AstNode[] = []): AstNode[] => {
  if (Array.isArray(node)) {
    node.forEach((child) => findImportExpressions(child, found));
  } else if (node && typeof node === 'object') {
    if ((node as AstNode).type === 'ImportExpression') {
      found.push(node as AstNode);
    } else {
      Object.values(node).forEach((child) => findImportExpressions(child, found));
    }
  }
  return found;
};

const getStaticImportSpecifier = ({ source }: AstNode): string | undefined => {
  if (source.type === 'Literal' && typeof source.value === 'string') {
    return source.value;
  }
  if (source.type === 'TemplateLiteral' && source.expressions.length === 0) {
    return source.quasis[0].value.cooked;
  }
};

const resolveRelativeImport = (importerFileName: string, node: AstNode) => {
  const specifier = getStaticImportSpecifier(node);
  if (!specifier || !(specifier.startsWith('./') || specifier.startsWith('../'))) {
    return undefined;
  }
  return normalizePosixPathParts(`${posixDirname(importerFileName)}/${specifier}`).join('/');
};

/** Vite's CSS pass deletes pure-CSS chunks but leaves their dynamic imports dangling. */
export const stubRemovedChunkImports = (
  context: Pick<Rolldown.PluginContext, 'parse' | 'warn'>,
  bundle: Rolldown.OutputBundle,
  fileNamesBeforeCssPass: ReadonlySet<string> = new Set()
) => {
  const isRemoved = (fileName: string | undefined) =>
    !!fileName && fileNamesBeforeCssPass.has(fileName) && !bundle[fileName];

  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk' || !output.dynamicImports.some(isRemoved)) {
      continue;
    }
    let ast;
    try {
      ast = context.parse(output.code);
    } catch (error) {
      context.warn(`Could not stub the imports of removed chunks in ${output.fileName}: ${error}`);
      continue;
    }
    // Import attributes go too: the module no longer exists.
    const removedImports = findImportExpressions(ast).filter((node) =>
      isRemoved(resolveRelativeImport(output.fileName, node))
    );
    if (!removedImports.length) {
      continue;
    }
    let code = output.code;
    // Edit back to front so earlier offsets stay valid.
    for (const { start, end } of removedImports.sort((a, b) => b.start - a.start)) {
      code = code.slice(0, start) + EMPTY_MODULE_EXPRESSION + code.slice(end);
    }
    output.code = code;
  }
};

export const createBuildWorkerCoreChunkResolver = (workerCoreChunkFileName: string) => {
  return (workerFileName: string) => {
    const relativePath = relativePosixPath(posixDirname(workerFileName), workerCoreChunkFileName);
    return ensureRelativeImportPath(relativePath);
  };
};

export const rewriteWorkerCorePlaceholders = (
  code: string,
  resolveWorkerCorePath: () => string | undefined
) => {
  if (!code.includes(QWIK_WORKER_CORE_SENTINEL)) {
    return code;
  }
  const workerCorePath = resolveWorkerCorePath();
  return workerCorePath ? code.replaceAll(QWIK_WORKER_CORE_SENTINEL, workerCorePath) : code;
};
