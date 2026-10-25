import { SourceMap, type SourceMapSegment } from 'magic-string';
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
const BASE64_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INLINE_SOURCEMAP_URL = /(?<=\/\/# sourceMappingURL=)data:\S+$/;

interface AstNode {
  type?: string;
  start: number;
  end: number;
  [key: string]: any;
}

const findRemovedImports = (
  node: unknown,
  isRemovedImport: (node: AstNode) => boolean,
  found: AstNode[] = []
): AstNode[] => {
  if (Array.isArray(node)) {
    node.forEach((child) => findRemovedImports(child, isRemovedImport, found));
  } else if (node && typeof node === 'object') {
    // Kept imports can still nest removed ones; replaced ones swallow theirs.
    if ((node as AstNode).type === 'ImportExpression' && isRemovedImport(node as AstNode)) {
      found.push(node as AstNode);
    } else {
      Object.values(node).forEach((child) => findRemovedImports(child, isRemovedImport, found));
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

/** Decodes to absolute segments, the shape magic-string's SourceMap encodes. */
const decodeMappings = (mappings: string) => {
  const absolute = [0, 0, 0, 0, 0];
  return mappings.split(';').map((line) => {
    absolute[0] = 0;
    return line
      ? line.split(',').map((segment) => {
          const deltas: number[] = [];
          let value = 0;
          let shift = 0;
          for (const char of segment) {
            const digit = BASE64_DIGITS.indexOf(char);
            value += (digit & 31) << shift;
            shift += 5;
            if (!(digit & 32)) {
              deltas.push(value & 1 ? -(value >> 1) : value >> 1);
              value = shift = 0;
            }
          }
          return deltas.map((delta, index) => (absolute[index] += delta));
        })
      : [];
  });
};

const getLineAndColumn = (code: string, offset: number) => {
  const lines = code.slice(0, offset).split('\n');
  return [lines.length - 1, lines[lines.length - 1].length];
};

const stubMappedRange = (lines: number[][][], code: string, start: number, end: number) => {
  const [startLine, startColumn] = getLineAndColumn(code, start);
  const [endLine, endColumn] = getLineAndColumn(code, end);
  if (startLine >= lines.length) {
    return;
  }
  // The segment at the range start stays, so the stub maps to the removed import.
  const before = lines[startLine].filter(([column]) => column <= startColumn);
  const after = (lines[endLine] ?? [])
    .filter(([column]) => column >= endColumn)
    .map(([column, ...rest]) => [
      column - endColumn + startColumn + EMPTY_MODULE_EXPRESSION.length,
      ...rest,
    ]);
  lines.splice(startLine, endLine - startLine + 1, [...before, ...after]);
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
    const removedImports = findRemovedImports(ast, (node) =>
      isRemoved(resolveRelativeImport(output.fileName, node))
    );
    if (!removedImports.length) {
      continue;
    }
    // The bundler does not recompose the map for edits made in generateBundle.
    const mappedLines = output.map && decodeMappings(output.map.mappings);
    let code = output.code;
    // Edit back to front so earlier offsets stay valid.
    for (const { start, end } of removedImports.sort((a, b) => b.start - a.start)) {
      if (mappedLines) {
        stubMappedRange(mappedLines, output.code, start, end);
      }
      code = code.slice(0, start) + EMPTY_MODULE_EXPRESSION + code.slice(end);
    }
    output.code = code;
    if (mappedLines) {
      const map = new SourceMap({ ...output.map!, mappings: mappedLines as SourceMapSegment[][] });
      output.map = map as typeof output.map;
      const sourceMapAsset = bundle[`${output.fileName}.map`];
      if (sourceMapAsset?.type === 'asset') {
        sourceMapAsset.source = map.toString();
      }
      output.code = output.code.replace(INLINE_SOURCEMAP_URL, () => map.toUrl());
    }
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
