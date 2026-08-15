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
} from 'magic-regexp';
import { transformSync as oxcTransformSync, type TransformOptions } from 'oxc-transform';
import type { SegmentCaptureInfo } from './segment-codegen.js';
import { runDcePipeline } from '../transform/module-cleanup.js';
import { deriveIsDev } from '../rewrite/const-replacement.js';
import type { EmitMode } from '../types/types.js';
import { isAnyComponentCtx } from '../rewrite/predicates.js';
import { wholeIdentifierPattern } from '../edit/identifier-boundary.js';

/**
 * `parentSourceExt` is the parent input file's extension (`.tsx`/`.ts`/`.jsx`/ `.js`), distinct
 * from the segment's _output_ `extension`/`sourceExtensions` (often downgraded to `.js`): it drives
 * oxc-transform's parser-input filename so a TS- or JSX-bearing segment body isn't rejected as a
 * syntax error.
 */
export interface SegmentPostProcessOptions {
  symbolName: string;
  canonicalFilename: string;
  extension: string;
  ctxName: string;
  sourceExtensions: Map<string, string>;
  parentSourceExt: string;
  shouldTranspileTs: boolean;
  shouldTranspileJsx: boolean;
  isServer?: boolean;
  emitMode: string;
  devFile?: string;
}

const tsTypeAnnotationProbe = createRegExp(
  exactly(':')
    .and(whitespace.times.any())
    .and(charIn('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_${[('))
);

const tsAngleAssertionProbe = createRegExp(
  exactly('<')
    .and(oneOrMore(wordChar))
    .and('>')
    .notBefore(whitespace.times.any(), anyOf(')', ',', ';'))
);

const tsGenericTypeListProbe = createRegExp(exactly('<').and(oneOrMore(wordChar)).and(','));

const tsAsCastProbe = createRegExp(wordBoundary.and('as').and(oneOrMore(whitespace)).and(wordChar));

const tsDeclarationProbe = createRegExp(
  wordBoundary
    .and(anyOf('interface', 'type', 'enum'))
    .and(oneOrMore(whitespace))
    .and(wordChar)
);

const tsNonNullPropertyProbe = createRegExp(
  oneOrMore(wordChar)
    .and(whitespace.times.any())
    .and(anyOf('!.', '![', '!)', '!,', '!;'))
);

const tsGenericCallProbe = createRegExp(
  exactly('<')
    .and(charIn('ABCDEFGHIJKLMNOPQRSTUVWXYZ'))
    .and(wordChar.times.any())
    .and(
      whitespace.times
        .any()
        .and(',')
        .and(whitespace.times.any())
        .and(oneOrMore(wordChar))
        .times.any()
    )
    .and(whitespace.times.any())
    .and('>')
    .and(whitespace.times.any())
    .and('(')
);

const pureAnnotationComment = createRegExp(exactly('/* @__PURE__ */'), [global]);

export const leadingSquareBracket = createRegExp(exactly('[').at.lineStart());

export const trailingSquareBracket = createRegExp(exactly(']').at.lineEnd());

export const leadingDot = createRegExp(exactly('.').at.lineStart());

export const paddingParam = createRegExp(
  exactly('_').and(digit.times.any()).at.lineStart().at.lineEnd()
);

export function getWholeWordPattern(name: string): RegExp {
  return wholeIdentifierPattern(name);
}

function hasCapturePayload(
  captureInfo: SegmentCaptureInfo,
  includeConstLiterals: boolean
): boolean {
  if (captureInfo.captureNames.length > 0) return true;
  if (captureInfo.autoImports.length > 0) return true;
  if (captureInfo.movedDeclarations.length > 0) return true;
  // Promoted-param consolidation carries only the field-rewrite map.
  if (captureInfo.propsFieldCaptures && captureInfo.propsFieldCaptures.size > 0) return true;
  return includeConstLiterals && captureInfo.constLiterals !== undefined;
}

export function resolveCaptureInfo(
  captureInfo: SegmentCaptureInfo,
  isInlinedQrl: boolean
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

export function postProcessSegmentCode(code: string, opts: SegmentPostProcessOptions): string {
  let result = code;
  const filename = opts.canonicalFilename + opts.extension;

  if (opts.shouldTranspileTs) {
    const hasTsSyntax =
      tsTypeAnnotationProbe.test(result) ||
      tsAngleAssertionProbe.test(result) ||
      tsGenericTypeListProbe.test(result) ||
      tsAsCastProbe.test(result) ||
      tsDeclarationProbe.test(result) ||
      tsNonNullPropertyProbe.test(result) ||
      tsGenericCallProbe.test(result);
    // Segments under a foreign `@jsxImportSource` pragma have raw JSX in their
    // body (Qwik's JSX-syntax rewrite was skipped); the TS-syntax probes don't
    // detect plain JSX, so force oxc-transform when the body still contains JSX.
    const needsJsxStrip = opts.shouldTranspileJsx && /<\/?[A-Za-z]/.test(result);
    if (hasTsSyntax || needsJsxStrip) {
      const tsStripOptions: TransformOptions = {
        typescript: { onlyRemoveTypeImports: false },
      };
      if (!opts.shouldTranspileJsx) {
        tsStripOptions.jsx = 'preserve';
      }
      // Parser-input filename must reflect the *source* dialect so oxc-transform
      // parses the segment body correctly (see parentSourceExt).
      const sourceExt = opts.parentSourceExt;
      const tsStripped = oxcTransformSync(
        opts.canonicalFilename + sourceExt,
        result,
        tsStripOptions
      );
      if (tsStripped.code) {
        result = tsStripped.code;
        result = result.replace(pureAnnotationComment, '/*#__PURE__*/');
      }
    }
  }

  result = runDcePipeline(result, filename, {
    isServer: opts.isServer,
    isDev: deriveIsDev(opts.emitMode as EmitMode),
    isLibMode: opts.emitMode === 'lib',
    hmrDevFile:
      opts.emitMode === 'hmr' && opts.devFile && isAnyComponentCtx(opts.ctxName)
        ? opts.devFile
        : undefined,
  });

  return result;
}
