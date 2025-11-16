import {
  findLocation,
  generateCodeFrame,
} from '../../../../qwik/src/optimizer/src/plugins/vite-utils';
import { normalizePath } from '../../utils/fs';
import fs from 'node:fs';

export function formatError(e: any) {
  if (e instanceof Error) {
    const err = e as any;
    let loc = err.loc;
    if (!err.frame && !err.plugin) {
      if (!loc) {
        loc = findLocation(err);
      }
      if (loc) {
        err.loc = loc;
        if (loc.file) {
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
  }
  return e;
}
