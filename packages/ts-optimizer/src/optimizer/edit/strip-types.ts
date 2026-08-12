import { parseSync } from 'oxc-parser';
import { transformSync as oxcTransformSync } from 'oxc-transform';
import { scanMatchingParenForward } from './text-scanning.js';

/**
 * Strip TypeScript syntax (`as` casts, non-null `!`, annotations) from an expression when present.
 * Serialized expression strings execute in the browser via the container's qFuncs script, where
 * leaked TS syntax is a page-wide SyntaxError. Expressions that already parse as plain JS are
 * returned byte-identical; only genuinely-TS text pays the transform (and its reprint). Generic
 * calls like `f<T>(x)` parse as comparison chains in JS and are not detected — acceptable, as
 * hoistable reactive expressions don't take type arguments.
 */
export function stripExpressionTypes(exprText: string): string {
  try {
    const probe = parseSync('__expr__.mjs', `(${exprText});`);
    if (!probe.errors?.length) return exprText;
  } catch {
    // fall through to the transform
  }
  try {
    const wrapped = `const __qs = (${exprText});`;
    const out = oxcTransformSync('__expr__.tsx', wrapped, {
      typescript: { onlyRemoveTypeImports: false },
      jsx: 'preserve',
    });
    if (!out.code) return exprText;
    // The transform may drop the redundant wrapping parens, so slice the
    // declaration initializer instead of matching them.
    const eqIdx = out.code.indexOf('=');
    const endIdx = out.code.lastIndexOf(';');
    if (eqIdx < 0 || endIdx <= eqIdx) return exprText;
    const stripped = out.code.slice(eqIdx + 1, endIdx).trim();
    return stripped.startsWith('(') && scanMatchingParenForward(stripped, 1) === stripped.length
      ? stripped.slice(1, -1)
      : stripped;
  } catch {
    return exprText;
  }
}
