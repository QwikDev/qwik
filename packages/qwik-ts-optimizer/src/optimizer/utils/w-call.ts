/**
 * Builders for the `.w([captures])` "with-captures" call the optimizer appends
 * to a QRL reference so the runtime injects the bound values into the segment.
 *
 * The capture list is laid out one-per-line with symmetric indentation: joiner
 * lines use `innerIndent`, the closing bracket uses `closeIndent`. The exact
 * whitespace matches the SWC reference output.
 *
 * Two emit sites keep their own inline layout and intentionally do NOT route
 * through here — the loop-callback hoist branch in `body-transforms.ts`
 * (asymmetric 12/8 indent) and the pre-joined-string `.w` emits in
 * `rewrite/index.ts`.
 */

/** The `.w([captures])` suffix, without the leading QRL variable. */
export function wCallSuffix(
  captures: readonly string[],
  innerIndent: string,
  closeIndent: string,
): string {
  return `.w([\n${innerIndent}${captures.join(',\n' + innerIndent)}\n${closeIndent}])`;
}

/** A full `qrlVar.w([captures])` expression. */
export function formatWCall(
  qrlVar: string,
  captures: readonly string[],
  innerIndent: string,
  closeIndent: string,
): string {
  return qrlVar + wCallSuffix(captures, innerIndent, closeIndent);
}
