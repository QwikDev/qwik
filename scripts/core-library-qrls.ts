import { dirname, join, relative } from 'node:path';

type TransformModule = (options: Record<string, unknown>) => {
  modules: { code: string; map?: string | null }[];
  diagnostics: { category: string; message: string }[];
};

const toPosix = (path: string) => path.replaceAll('\\', '/');

/** Calls of `$()`, `component$()` and `useTask$()`, but not of `$name$()` properties. */
const QRL_MARKER_CALL = /(?<![\w$.])(\$|component\$|useTask\$)\(/;

/**
 * Compiles core's `$()` sites the way the optimizer ships any Qwik library: into `inlinedQrl()`
 * calls that the app's optimizer turns into segments. Their `@qwik.dev/core` imports point at
 * `optimizer-imports` instead, since core's barrel would import those files back. Used by core's
 * build and by the unit tests, which run core's sources.
 */
export function compileCoreQrls(
  transformModule: TransformModule,
  coreDir: string,
  id: string,
  code: string
) {
  if (!id.startsWith(coreDir) || !QRL_MARKER_CALL.test(code)) {
    return null;
  }
  const result = transformModule({
    // Posix, so the segment hashes match on every platform.
    input: [{ path: toPosix(relative(dirname(coreDir), id)), code }],
    srcDir: '.',
    mode: 'lib',
    entryStrategy: { type: 'inline' },
    transpileTs: false,
    transpileJsx: false,
    minify: 'none',
    explicitExtensions: false,
    preserveFilenames: false,
    sourceMaps: true,
  });
  const errors = result.diagnostics.filter((d) => d.category === 'error');
  if (errors.length) {
    throw new Error(`${id}: ${errors.map((d) => d.message).join('\n')}`);
  }
  const [output] = result.modules;
  const optimizerImports = relative(
    dirname(id),
    join(coreDir, 'shared', 'qrl', 'optimizer-imports')
  );
  const posixPath = toPosix(optimizerImports);
  const specifier = posixPath.startsWith('.') ? posixPath : `./${posixPath}`;
  return {
    code: output.code.replaceAll('from "@qwik.dev/core"', `from "${specifier}"`),
    map: output.map,
  };
}
