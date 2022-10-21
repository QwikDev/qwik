import fs from 'node:fs';
import { isAbsolute } from 'node:path';
import type { NormalizedPluginOptions } from '../types';

export async function validatePlugin(opts: NormalizedPluginOptions) {
  if (typeof opts.routesDir !== 'string') {
    throw new Error(`qwikCity plugin "routesDir" option missing`);
  }

  if (!isAbsolute(opts.routesDir)) {
    throw new Error(
      `qwikCity plugin "routesDir" option must be an absolute path: ${opts.routesDir}`
    );
  }

  try {
    const s = await fs.promises.stat(opts.routesDir);
    if (!s.isDirectory()) {
      throw new Error(`qwikCity plugin "routesDir" option must be a directory: ${opts.routesDir}`);
    }
  } catch (e) {
    throw new Error(`qwikCity plugin "routesDir" not found: ${e}`);
  }
}
