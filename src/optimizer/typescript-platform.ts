import type TypeScript from 'typescript';
import type { Optimizer, InternalCache } from './types';
import { platform } from './utils';

export function getTsConfigCompilerOptions(optimizer: Optimizer, c: InternalCache) {
  if (c.compilerOpts == null) {
    const ts = getTypeScript(optimizer, c);
    if (typeof ts?.sys?.fileExists === 'function') {
      const rootDir = optimizer.getRootDir();
      const tsconfigPath = ts.findConfigFile(rootDir, ts.sys.fileExists);
      if (tsconfigPath) {
        const tsconfigResults = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
        if (!tsconfigResults.error) {
          const parseResult = ts.parseJsonConfigFileContent(
            tsconfigResults.config,
            ts.sys,
            rootDir,
            undefined,
            tsconfigPath
          );
          c.compilerOpts = parseResult.options;
        }
      }
    }
  }
  return c.compilerOpts;
}

export function getTypeScript(optimizer: Optimizer, c: InternalCache): typeof TypeScript {
  if (c.ts == null) {
    if (platform === 'node') {
      if (typeof require === 'function') {
        // NodeJs (CJS)
        c.ts = require(optimizer.getTypeScriptPath());
      } else {
        throw new Error('NodeJs require() not available');
      }
    } else if (platform === 'browser-webworker') {
      // Browser (Web Worker)
      if (!self.ts) {
        (self as any).importScripts(optimizer.getTypeScriptPath());
      }
      c.ts = self.ts;
    } else if (platform === 'browser-main') {
      // Browser (Main)
      if (!window.ts) {
        throw new Error(`Browser main must already have TypeScript loaded on "window.ts"`);
      }
      c.ts = window.ts;
    }
  }
  return c.ts;
}

export function getTypeScriptVersion(optimizer: Optimizer, c: InternalCache) {
  const ts = getTypeScript(optimizer, c);
  return ts.version;
}

export function getTypeScriptPath(userOverride: string | null) {
  if (typeof userOverride === 'string') {
    return userOverride;
  }
  if (platform === 'node') {
    return `typescript`;
  }
  if (platform === 'browser-main' || platform === 'browser-webworker') {
    return `https://cdn.jsdelivr.net/npm/typescript@4.3.2/lib/typescript.js`;
  }
  throw Error(`unsupported platform`);
}

declare const window: {
  ts?: typeof TypeScript;
};

declare const self: {
  ts?: typeof TypeScript;
};
