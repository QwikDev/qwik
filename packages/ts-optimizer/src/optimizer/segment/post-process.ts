import { createRegExp, digit, exactly, global } from 'magic-regexp';
import { type TransformOptions } from 'oxc-transform';
import type { SegmentCaptureInfo } from './segment-codegen.js';
import { runDcePipeline } from '../transform/module-cleanup.js';
import { deriveIsDev } from '../rewrite/const-replacement.js';
import type { EmitMode } from '../types/types.js';
import { isAnyComponentCtx } from '../rewrite/predicates.js';
import { wholeIdentifierPattern } from '../edit/identifier-boundary.js';
import { stripTypeScript, type StripOrigin } from '../edit/strip-types.js';

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
  origin: StripOrigin;
  shouldTranspileTs: boolean;
  shouldTranspileJsx: boolean;
  isServer?: boolean;
  emitMode: string;
  devFile?: string;
}

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
  if (captureInfo.captureNames.length > 0) {
    return true;
  }
  if (captureInfo.autoImports.length > 0) {
    return true;
  }
  if (captureInfo.movedDeclarations.length > 0) {
    return true;
  }
  // Promoted-param consolidation carries only the field-rewrite map.
  if (captureInfo.propsFieldCaptures && captureInfo.propsFieldCaptures.size > 0) {
    return true;
  }
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

  // Always transpile rather than probing for TS/JSX syntax first: a probe list
  // that misses a shape silently emits unstripped TS, and oxc has to parse the
  // body here anyway.
  if (opts.shouldTranspileTs) {
    const tsStripOptions: TransformOptions = {
      typescript: { onlyRemoveTypeImports: false },
    };
    if (!opts.shouldTranspileJsx) {
      tsStripOptions.jsx = 'preserve';
    }
    // Parser-input filename must reflect the *source* dialect so oxc-transform
    // parses the segment body correctly (see parentSourceExt).
    result = stripTypeScript(
      opts.canonicalFilename + opts.parentSourceExt,
      result,
      tsStripOptions,
      `generated segment "${opts.symbolName}"`,
      opts.origin
    );
    result = result.replace(pureAnnotationComment, '/*#__PURE__*/');
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
