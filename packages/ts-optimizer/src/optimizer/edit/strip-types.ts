import { parseSync } from 'oxc-parser';
import { transformSync as oxcTransformSync, type TransformOptions } from 'oxc-transform';
import { scanMatchingParenForward } from './text-scanning.js';

interface OxcError {
  severity?: string;
  message?: string;
  codeframe?: string | null;
}

function hasFatalError(errors: readonly OxcError[] | undefined): boolean {
  return errors?.some((e) => e.severity !== 'Warning') === true;
}

function formatOxcErrors(errors: readonly OxcError[] | undefined): string {
  return (errors ?? []).map((e) => e.codeframe || e.message || String(e)).join('\n');
}

/** `.ts` rejects JSX and `.tsx` rejects `<T>(x) => x`, so the other dialect may still parse. */
function otherTsDialect(filename: string): string | undefined {
  if (filename.endsWith('.tsx')) {
    return filename.slice(0, -1);
  }
  if (filename.endsWith('.ts')) {
    return filename + 'x';
  }
  return undefined;
}

/** The module this code was generated from, used to tell our bugs apart from the user's. */
export interface StripOrigin {
  filename: string;
  text: string;
}

/**
 * Strip TypeScript with oxc, throwing when the input does not parse. Returning the unstripped
 * source instead would emit TS syntax into a `.js` file, which the bundler reports much later as a
 * parse error pointing at the first type annotation rather than at the code that actually broke.
 * `context` names what is being stripped so that report identifies the culprit. When `origin` is
 * itself unparseable the user's own syntax error is passed through untouched, matching the Rust
 * optimizer.
 */
export function stripTypeScript(
  filename: string,
  code: string,
  options: TransformOptions,
  context: string,
  origin?: StripOrigin
): string {
  const stripped = oxcTransformSync(filename, code, options);
  if (!hasFatalError(stripped.errors)) {
    return stripped.code;
  }
  const alternate = otherTsDialect(filename);
  if (alternate) {
    const retry = oxcTransformSync(alternate, code, options);
    if (!hasFatalError(retry.errors)) {
      return retry.code;
    }
  }
  if (origin && hasFatalError(parseSync(origin.filename, origin.text).errors)) {
    return code;
  }
  throw new Error(
    `Qwik optimizer: could not strip TypeScript from ${context}.\n${formatOxcErrors(stripped.errors)}`
  );
}

/**
 * Strip TypeScript syntax (`as` casts, non-null `!`, annotations) from an expression when present.
 * Serialized expression strings execute in the browser via the container's qFuncs script, where
 * leaked TS syntax is a page-wide SyntaxError. Expressions that already parse as plain JS are
 * returned byte-identical; only genuinely-TS text pays the transform (and its reprint). Generic
 * calls like `f<T>(x)` parse as comparison chains in JS and are not detected — acceptable, as
 * hoistable reactive expressions don't take type arguments.
 */
export function stripExpressionTypes(exprText: string): string {
  const probe = parseSync('__expr__.mjs', `(${exprText});`);
  if (!probe.errors?.length) {
    return exprText;
  }
  const context = `reactive expression \`${exprText}\``;
  const wrapped = `const __qs = (${exprText});`;
  const out = stripTypeScript(
    '__expr__.tsx',
    wrapped,
    { typescript: { onlyRemoveTypeImports: false }, jsx: 'preserve' },
    context
  );
  // The transform may drop the redundant wrapping parens, so slice the
  // declaration initializer instead of matching them.
  const eqIdx = out.indexOf('=');
  const endIdx = out.lastIndexOf(';');
  if (eqIdx < 0 || endIdx <= eqIdx) {
    throw new Error(`Qwik optimizer: unexpected strip output for ${context}:\n${out}`);
  }
  const stripped = out.slice(eqIdx + 1, endIdx).trim();
  return stripped.startsWith('(') && scanMatchingParenForward(stripped, 1) === stripped.length
    ? stripped.slice(1, -1)
    : stripped;
}
