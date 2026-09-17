import type { SourceFile } from 'ts-morph';
import { ensureCallOption, findCalls, findNamedImports } from './utils';

/**
 * V2 loaders don't see search params and don't re-run after actions unless configured to
 * (`strictLoaders`). `strictLoaders: false` keeps the v1 behavior.
 */
export const keepV1LoaderInvalidation = (file: SourceFile) => {
  const plugins = findNamedImports(file, '@builder.io/qwik-city/vite', 'qwikCity');
  // one call per config in practice, ensureCallOption forgets the nodes
  const [call] = findCalls(file, plugins);
  return call ? ensureCallOption(call, 'strictLoaders', 'false') : false;
};

/** The node and deno middlewares of v2 limit request bodies to 10 MiB, v1 had no limit. */
export const keepV1RequestBodyLimit = (file: SourceFile) => {
  const creates = ['node', 'deno'].flatMap((m) =>
    findNamedImports(file, `@builder.io/qwik-city/middleware/${m}`, 'createQwikCity')
  );
  const [call] = findCalls(file, creates);
  return call ? ensureCallOption(call, 'requestBodyLimit', 'Number.MAX_SAFE_INTEGER') : false;
};
