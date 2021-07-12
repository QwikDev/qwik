import type TypeScript from 'typescript';
import type { ResolveModuleOptions, ResolveModuleResult } from './types';
import { platform } from './utils';

export function getTsconfig(
  ts: typeof TypeScript,
  rootDir: string
): TypeScript.ParsedCommandLine | null {
  if (ts && ts.sys) {
    const tsconfigPath = ts.findConfigFile(rootDir, ts.sys.fileExists);
    if (tsconfigPath) {
      const tsconfigResults = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      if (!tsconfigResults.error) {
        return ts.parseJsonConfigFileContent(
          tsconfigResults.config,
          ts.sys,
          rootDir,
          undefined,
          tsconfigPath
        );
      }
    }
  }
  return null;
}

export async function getTypeScript(rootDir: string): Promise<typeof TypeScript | null> {
  if (platform === 'node' && typeof require !== 'function') {
    const module = await import('module');
    const require = module.Module.createRequire(rootDir);
    return require(getTypeScriptPath());
  }
  return getTypeScriptSync();
}

export function getTypeScriptSync(): typeof TypeScript | null {
  if (platform === 'node') {
    if (typeof require === 'function') {
      // NodeJs (CJS)
      return require(getTypeScriptPath());
    } else {
      throw new Error('NodeJs require() not available');
    }
  } else if (platform === 'browser-webworker') {
    // Browser (Web Worker)
    if (!self.ts) {
      (self as any).importScripts(getTypeScriptPath());
    }
    return self.ts as any;
  } else if (platform === 'browser-main') {
    // Browser (Main)
    if (!window.ts) {
      throw new Error(`Browser main must already have TypeScript loaded on "window.ts"`);
    }
  }
  return null;
}

function getTypeScriptPath() {
  if (platform === 'node') {
    return `typescript`;
  }
  if (platform === 'browser-main' || platform === 'browser-webworker') {
    return `https://cdn.jsdelivr.net/npm/typescript@__TYPESCRIPT__/lib/typescript.js`;
  }
  throw Error(`unsupported platform`);
}

export function resolveModuleSync(
  ts: typeof TypeScript,
  compilerOpts: TypeScript.CompilerOptions,
  moduleResolveCache: TypeScript.ModuleResolutionCache,
  opts: ResolveModuleOptions
) {
  if (!opts.host) {
    if (platform === 'node') {
      opts.host = ts.sys;
    }
  }
  const tsResult = ts.resolveModuleName(
    opts.moduleName,
    opts.containingFile,
    compilerOpts,
    opts.host!,
    moduleResolveCache
  );
  const result: ResolveModuleResult = {};
  if (tsResult?.resolvedModule) {
    if (tsResult.resolvedModule.packageId) {
      result.name = tsResult.resolvedModule.packageId.name;
      result.subModuleName = tsResult.resolvedModule.packageId.subModuleName;
      result.version = tsResult.resolvedModule.packageId.version;
    }
    result.isExternalLibraryImport = tsResult.resolvedModule.isExternalLibraryImport;
    result.resolvedFileName = tsResult.resolvedModule.resolvedFileName;
  }
  return result;
}

declare const window: {
  ts?: typeof TypeScript;
};

declare const self: {
  ts?: typeof TypeScript;
};
