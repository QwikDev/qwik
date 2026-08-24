import { type TransformOptions } from 'oxc-transform';
import MagicString from 'magic-string';
import type { SegmentCaptureInfo } from './segment-codegen.js';
import { runDcePipeline } from '../transform/module-cleanup.js';
import { deriveIsDev } from '../rewrite/const-replacement.js';
import type { EmitMode } from '../types/types.js';
import { isAnyComponentCtx } from '../rewrite/predicates.js';
import { wholeIdentifierPattern } from '../edit/identifier-boundary.js';
import { stripTypeScript, type StripOrigin } from '../edit/strip-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';

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
  isBare?: boolean;
  sourceExtensions: Map<string, string>;
  parentModulePath: string;
  parentSourceExt: string;
  origin: StripOrigin;
  shouldTranspileTs: boolean;
  shouldTranspileJsx: boolean;
  isServer?: boolean;
  emitMode: string;
  devFile?: string;
  prioritizeGeneratedCaptures?: boolean;
}

const pureAnnotationComment = /\/\* @__PURE__ \*\//g;

export const leadingSquareBracket = /^\[/;

export const trailingSquareBracket = /\]$/;

export const leadingDot = /^\./;

export const paddingParam = /^_\d*$/;

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
      opts.emitMode === 'hmr' && opts.devFile && !opts.isBare && isAnyComponentCtx(opts.ctxName)
        ? opts.devFile
        : undefined,
  });

  return sortSegmentImports(
    result,
    filename,
    opts.parentModulePath,
    opts.prioritizeGeneratedCaptures === true
  );
}

function sortSegmentImports(
  code: string,
  filename: string,
  parentModulePath: string,
  prioritizeGeneratedCaptures: boolean
): string {
  const imports = parseWithRawTransfer(filename, code).program.body.filter(
    (node) => node.type === 'ImportDeclaration'
  );
  if (imports.length < 2) {
    return code;
  }
  for (let index = 1; index < imports.length; index++) {
    if (code.slice(imports[index - 1].end, imports[index].start).trim()) {
      return code;
    }
  }
  const importKey = (node: (typeof imports)[number]): string =>
    node.specifiers
      .map((specifier) => specifier.local.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0] ?? '';
  const hasExistingCaptureImport =
    !prioritizeGeneratedCaptures &&
    imports.some((node) =>
      node.specifiers.some((specifier) => specifier.local.name === '_captures')
    );
  const sorted = [...imports].sort((a, b) => {
    const rank = (node: (typeof imports)[number]): number => {
      if (node.specifiers.length === 0) {
        return -1;
      }
      if (
        node.specifiers.some(
          (specifier) =>
            specifier.type === 'ImportSpecifier' &&
            (specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value
            ).startsWith('_auto_')
        )
      ) {
        return 0;
      }
      if (hasExistingCaptureImport) {
        return 1;
      }
      if (node.specifiers.some((specifier) => specifier.local.name === '_captures')) {
        return 1;
      }
      return node.source.value === parentModulePath ? 2 : 3;
    };
    const rankA = rank(a);
    const rankB = rank(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    const keyA = importKey(a);
    const keyB = importKey(b);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  if (sorted.every((node, index) => node === imports[index])) {
    return code;
  }
  const edits = new MagicString(code);
  edits.overwrite(
    imports[0].start,
    imports.at(-1)!.end,
    sorted.map((node) => code.slice(node.start, node.end)).join('\n')
  );
  return edits.toString();
}
