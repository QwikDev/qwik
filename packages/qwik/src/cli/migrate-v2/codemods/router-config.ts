import type { SourceFile } from 'ts-morph';
import { ensureCallOption, findCalls, findNamedImports } from './utils';

/**
 * V2 loaders don't see search params and don't re-run after actions unless configured to
 * (`strictLoaders`). `strictLoaders: false` keeps the v1 behavior.
 */
export const keepV1LoaderInvalidation = (file: SourceFile) => {
  const plugins = ['qwikCity', 'qwikRouter'].flatMap((name) =>
    findNamedImports(file, '@builder.io/qwik-city/vite', name)
  );
  // one call per config in practice, ensureCallOption forgets the nodes
  const [call] = findCalls(file, plugins);
  return call ? ensureCallOption(call, 'strictLoaders', 'false') : false;
};
