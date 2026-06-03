/**
 * Segment post-processing helpers for the transform pipeline.
 *
 * Contains TS type probes, regex patterns, and the postProcessSegmentCode
 * function that applies TS stripping, const replacement, DCE, side-effect
 * simplification, HMR injection, and import cleanup to generated segments.
 */

import {
  anyOf,
  charIn,
  createRegExp,
  digit,
  exactly,
  global,
  oneOrMore,
  whitespace,
  wordBoundary,
  wordChar,
} from "magic-regexp";
import { transformSync as oxcTransformSync, type TransformOptions } from "oxc-transform";
import type { SegmentCaptureInfo } from '../segment-codegen.js';
import {
  applySegmentConstReplacement,
  applySegmentSideEffectSimplification,
  injectUseHmr,
  removeUnusedImports,
} from './module-cleanup.js';
import { applySegmentDCE, hasSegmentDcePatterns } from './dead-code.js';
import { isAnyComponentCtx } from '../rewrite/predicates.js';
import { parseWithRawTransfer } from '../utils/parse.js';
import type { AstProgram } from '../../ast-types.js';

export interface SegmentPostProcessOptions {
  symbolName: string;
  canonicalFilename: string;
  extension: string;
  ctxName: string;
  sourceExtensions: Map<string, string>;
  /**
   * The parent input file's extension (`.tsx`, `.ts`, `.jsx`,
   * `.js`). Drives the parser-input filename passed to oxc-transform's
   * TS-strip / JSX-strip pass. Separate from {@link sourceExtensions} and
   * {@link extension}, which carry the segment's *output* extension —
   * frequently downgraded to `.js` even when the parent source contains
   * TS or JSX, which would cause oxc-transform to reject TS-typed
   * segment bodies as syntax errors.
   */
  parentSourceExt: string;
  shouldTranspileTs: boolean;
  shouldTranspileJsx: boolean;
  isServer?: boolean;
  emitMode: string;
  devFile?: string;
}

const tsTypeAnnotationProbe = createRegExp(
  exactly(":")
    .and(whitespace.times.any())
    .and(charIn("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_${[(")),
);

const tsAngleAssertionProbe = createRegExp(
  exactly("<")
    .and(oneOrMore(wordChar))
    .and(">")
    .notBefore(whitespace.times.any(), anyOf(")", ",", ";")),
);

const tsGenericTypeListProbe = createRegExp(
  exactly("<").and(oneOrMore(wordChar)).and(","),
);

const tsAsCastProbe = createRegExp(
  wordBoundary.and("as").and(oneOrMore(whitespace)).and(wordChar),
);

const tsDeclarationProbe = createRegExp(
  wordBoundary
    .and(anyOf("interface", "type", "enum"))
    .and(oneOrMore(whitespace))
    .and(wordChar),
);

const tsNonNullPropertyProbe = createRegExp(
  oneOrMore(wordChar).and(whitespace.times.any()).and(anyOf("!.", "![")),
);

const tsGenericCallProbe = createRegExp(
  exactly("<")
    .and(charIn("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
    .and(wordChar.times.any())
    .and(
      whitespace
        .times.any()
        .and(",")
        .and(whitespace.times.any())
        .and(oneOrMore(wordChar))
        .times.any(),
    )
    .and(whitespace.times.any())
    .and(">")
    .and(whitespace.times.any())
    .and("("),
);

const pureAnnotationComment = createRegExp(exactly("/* @__PURE__ */"), [global]);

export const leadingSquareBracket = createRegExp(exactly("[").at.lineStart());

export const trailingSquareBracket = createRegExp(exactly("]").at.lineEnd());

export const leadingDot = createRegExp(exactly(".").at.lineStart());

export const numberedPaddingParam = createRegExp(
  exactly("_").and(oneOrMore(digit)).at.lineStart().at.lineEnd(),
);

export const paddingParam = createRegExp(
  exactly("_").and(digit.times.any()).at.lineStart().at.lineEnd(),
);

const wholeWordPatternCache = new Map<string, RegExp>();

export function getWholeWordPattern(name: string): RegExp {
  const cached = wholeWordPatternCache.get(name);
  if (cached) {
    return cached;
  }

  const pattern = createRegExp(
    wordBoundary.and(exactly(name)).and(wordBoundary),
  );
  wholeWordPatternCache.set(name, pattern);
  return pattern;
}

function hasCapturePayload(
  captureInfo: SegmentCaptureInfo,
  includeConstLiterals: boolean,
): boolean {
  if (captureInfo.captureNames.length > 0) return true;
  if (captureInfo.autoImports.length > 0) return true;
  if (captureInfo.movedDeclarations.length > 0) return true;
  return includeConstLiterals && captureInfo.constLiterals !== undefined;
}

export function resolveCaptureInfo(
  captureInfo: SegmentCaptureInfo,
  isInlinedQrl: boolean,
): SegmentCaptureInfo | undefined {
  const includeConstLiterals = !isInlinedQrl;
  if (!hasCapturePayload(captureInfo, includeConstLiterals)) {
    return undefined;
  }

  if (isInlinedQrl) {
    return { ...captureInfo, skipCaptureInjection: true };
  }

  return captureInfo;
}

/**
 * Apply post-processing transforms to generated segment code:
 * TS stripping, const replacement, DCE, side-effect simplification, HMR injection, import cleanup.
 */
export function postProcessSegmentCode(
  code: string,
  opts: SegmentPostProcessOptions,
): string {
  let result = code;
  const filename = opts.canonicalFilename + opts.extension;

  // Strip TS types when transpileTs is enabled
  if (opts.shouldTranspileTs) {
    const hasTsSyntax =
      tsTypeAnnotationProbe.test(result) ||
      tsAngleAssertionProbe.test(result) ||
      tsGenericTypeListProbe.test(result) ||
      tsAsCastProbe.test(result) ||
      tsDeclarationProbe.test(result) ||
      tsNonNullPropertyProbe.test(result) ||
      tsGenericCallProbe.test(result);
    // Segments under a foreign `@jsxImportSource` pragma have raw JSX in
    // their body (Qwik's JSX-syntax rewrite was skipped). The TS-syntax
    // probes don't detect plain JSX, so force oxc-transform to run when
    // the body still contains JSX and we should transpile it.
    // oxc-transform honors the pragma we prepended in
    // `segment-generation.ts`.
    const needsJsxStrip =
      opts.shouldTranspileJsx && /<\/?[A-Za-z]/.test(result);
    if (hasTsSyntax || needsJsxStrip) {
      const tsStripOptions: TransformOptions = {
        typescript: { onlyRemoveTypeImports: false },
      };
      if (!opts.shouldTranspileJsx) {
        tsStripOptions.jsx = "preserve";
      }
      // Parser-input filename must reflect the *source* dialect
      // (`.tsx` / `.ts` / `.jsx` / `.js`) so oxc-transform parses the
      // segment body correctly. The segment's output `extension` may
      // have been downgraded to `.js` upstream (when `shouldTranspileTs`
      // and/or `shouldTranspileJsx` is set), and `sourceExtensions`
      // captures the pre-downgrade *segment* extension — which is
      // itself already `.js` for non-JSX-bearing segments per
      // `extensionFromSegmentJsx`. All segment bodies come from the
      // parent input file, so the parent's extension is the
      // authoritative source dialect.
      const sourceExt = opts.parentSourceExt;
      const tsStripped = oxcTransformSync(
        opts.canonicalFilename + sourceExt,
        result,
        tsStripOptions,
      );
      if (tsStripped.code) {
        result = tsStripped.code;
        result = result.replace(pureAnnotationComment, "/*#__PURE__*/");
      }
    }
  }

  // Single-parse-cache for the post-process pipeline. Each helper accepts
  // `preParsedProgram?: AstProgram`; we parse once on first use and reuse
  // until a helper mutates the code (which invalidates the AST). Matches
  // `CODING_BEST_PRACTICES.md` "Should only ever parse once" — when no
  // helper mutates, the pipeline parses at most once for all four steps.
  let cachedProgram: AstProgram | undefined;
  const lazyParse = (): AstProgram | undefined => {
    if (cachedProgram) return cachedProgram;
    try {
      cachedProgram = parseWithRawTransfer(filename, result).program;
    } catch {
      cachedProgram = undefined;
    }
    return cachedProgram;
  };
  const runHelper = <T extends string>(helper: () => T): T => {
    const before = result;
    const out = helper();
    // String identity is sufficient: helpers return the original `result`
    // reference when they no-op, and a new string when they mutate.
    if (out !== before) cachedProgram = undefined;
    return out;
  };

  // Apply isServer/isBrowser const replacement
  if (
    opts.isServer !== undefined &&
    (result.includes("@qwik.dev/core") || result.includes("@builder.io/qwik"))
  ) {
    result = runHelper(() =>
      applySegmentConstReplacement(result, filename, opts.isServer, lazyParse()),
    );
  }

  // Dead code elimination
  if (hasSegmentDcePatterns(result)) {
    result = runHelper(() => applySegmentDCE(result));
  }

  // Side-effect simplification for unused variable bindings
  const exportIdx = result.indexOf("export const ");
  const afterExportLine = exportIdx >= 0 ? result.indexOf("\n", exportIdx) : -1;
  if (afterExportLine >= 0 && result.indexOf("const ", afterExportLine) >= 0) {
    result = runHelper(() =>
      applySegmentSideEffectSimplification(result, filename, lazyParse()),
    );
  }

  // HMR injection for component$ segments
  if (opts.emitMode === "hmr" && opts.devFile && isAnyComponentCtx(opts.ctxName)) {
    result = runHelper(() => injectUseHmr(result, opts.devFile!, lazyParse()));
  }

  // Clean up unused imports
  if (result.includes("\nimport ")) {
    result = runHelper(() =>
      removeUnusedImports(result, filename, undefined, lazyParse()),
    );
  }

  return result;
}
