import type { OptimizerSystem } from '../types';

export async function findDepPkgJsonPath(sys: OptimizerSystem, dep: string, parent: string) {
  if (sys.env === 'browsermain' || sys.env === 'webworker') {
    return undefined;
  }
  const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
  let root = parent;
  while (root) {
    const pkg = sys.path.join(root, 'node_modules', dep, 'package.json');
    try {
      await fs.promises.access(pkg);
      // use 'node:fs' version to match 'vite:resolve' and avoid realpath.native quirk
      // https://github.com/sveltejs/vite-plugin-svelte/issues/525#issuecomment-1355551264
      return fs.promises.realpath(pkg);
    } catch {
      //empty
    }
    const nextRoot = sys.path.dirname(root);
    if (nextRoot === root) {
      break;
    }
    root = nextRoot;
  }
  return undefined;
}
