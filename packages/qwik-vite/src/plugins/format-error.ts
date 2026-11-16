import type { OptimizerSystem } from '../types';
import { findLocation, generateCodeFrame } from './vite-utils';

export async function formatError(sys: OptimizerSystem, e: Error) {
  const err = e as any;
  let loc = err.loc;

  if (!err.frame && !err.plugin) {
    if (!loc) {
      loc = findLocation(err);
    }
    if (loc) {
      err.loc = loc;
      if (loc.file) {
        const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
        // Resolve vite from this bundle, not from the optimizer package.
        const { normalizePath }: typeof import('vite') = await import('vite');
        err.id = normalizePath(err.loc.file);
        try {
          const code = fs.readFileSync(err.loc.file, 'utf-8');
          err.frame = generateCodeFrame(code, err.loc);
        } catch {
          // nothing
        }
      }
    }
  }
  return e;
}
