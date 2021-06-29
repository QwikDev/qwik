import type {
  Optimizer,
  InternalCache,
  TransformModuleOptions,
  TransformModuleResult,
} from './types';
import type TypeScript from 'typescript';
import { isJsxFile, toBase64 } from './utils';
import { getTypeScript } from './typescript-platform';

export function transformModule(
  optimizer: Optimizer,
  c: InternalCache,
  opts: TransformModuleOptions
) {
  const ts = getTypeScript(optimizer, c);

  const compilerOptions = getCompilerOptions(ts, optimizer, opts);

  const cacheKey =
    optimizer.isCacheEnabled() && typeof opts.createCacheKey === 'function'
      ? opts.createCacheKey(
          JSON.stringify({
            f: opts.filePath,
            c: opts.code,
            t: ts.version,
            ...compilerOptions,
          })
        )
      : null;

  if (cacheKey) {
    const inMemoryCache = c.modules.find((c) => c.cacheKey === cacheKey);
    if (inMemoryCache) {
      return inMemoryCache;
    }

    if (typeof opts.readFromCacheSync === 'function') {
      const cachedResult = opts.readFromCacheSync(cacheKey);
      if (cachedResult) {
        setInMemoryCache(c, cachedResult);
        return cachedResult;
      }
    }
  }

  const tsResult = ts.transpileModule(opts.code, {
    compilerOptions,
    fileName: opts.filePath,
  });

  const result: TransformModuleResult = {
    filePath: opts.filePath,
    code: tsResult.outputText,
    map: tsResult.sourceMapText,
    cacheKey,
  };

  if (typeof result.code === 'string' && opts.sourcemap === 'inline' && result.map) {
    try {
      const sourceMap = JSON.parse(result.map);
      sourceMap.file = opts.filePath;
      sourceMap.sources = [opts.filePath];
      delete sourceMap.sourceRoot;

      const base64Map = toBase64(JSON.stringify(sourceMap));
      if (base64Map !== '') {
        const sourceMapInlined = `data:application/json;charset=utf-8;base64,${base64Map}`;
        const commentPos = result.code.lastIndexOf('//#');
        result.code = result.code.slice(0, commentPos) + '//# sourceMappingURL=' + sourceMapInlined;
        result.map = undefined;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  if (Array.isArray(tsResult.diagnostics) && tsResult.diagnostics.length > 0) {
    return result;
  }

  if (cacheKey) {
    setInMemoryCache(c, result);

    if (typeof opts.writeToCacheSync === 'function') {
      opts.writeToCacheSync(cacheKey, result);
    }
  }

  return result;
}

function getCompilerOptions(
  ts: typeof TypeScript,
  optimizer: Optimizer,
  opts: TransformModuleOptions
) {
  const tsconfigCompilerOpts = optimizer.getTsConfigCompilerOptions();

  const compilerOpts: TypeScript.CompilerOptions = {
    ...ts.getDefaultCompilerOptions(),
    ...tsconfigCompilerOpts,
    declaration: false,
    isolatedModules: true,
    skipLibCheck: true,
    suppressOutputPathCheck: true,
    allowNonTsExtensions: true,
    noLib: true,
    noResolve: true,
  };

  if (typeof compilerOpts.esModuleInterop !== 'boolean') {
    compilerOpts.esModuleInterop = true;
  }

  compilerOpts.module = opts.module === 'cjs' ? ts.ModuleKind.CommonJS : ts.ModuleKind.ES2020;

  if (typeof compilerOpts.target === 'undefined') {
    compilerOpts.target = ts.ScriptTarget.ES2017;
  }

  if (opts.sourcemap === true || opts.sourcemap === 'inline') {
    compilerOpts.sourceMap = true;
  } else if (compilerOpts.sourceMap !== false) {
    const sourceMapOpt = optimizer.getSourceMapOption();
    compilerOpts.sourceMap = sourceMapOpt === true || sourceMapOpt === 'inline';
  }

  if (isJsxFile(opts.filePath)) {
    compilerOpts.jsx = ts.JsxEmit.ReactJSX;
    compilerOpts.jsxImportSource = '@builder.io/qwik';
  }

  return compilerOpts;
}

function setInMemoryCache(c: InternalCache, result: TransformModuleResult) {
  const currentIndex = c.modules.findIndex((c) => c.filePath === result.filePath);
  if (currentIndex > -1) {
    c.modules.splice(currentIndex, 1);
  }
  c.modules.push(result);
  while (c.modules.length > 300) {
    c.modules.shift();
  }
}
