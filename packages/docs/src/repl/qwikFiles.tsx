// Special case for qwik, we serve that from /public, populated by the prebuild script

export const qwikFiles = [
  'build/index.d.ts',
  'core.cjs',
  'core.d.ts',
  'core.min.mjs',
  'core.mjs',
  'jsx-runtime.d.ts',
  'optimizer.cjs',
  'server.cjs',
  'server.d.ts',
];
