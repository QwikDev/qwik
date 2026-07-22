
import { walk } from 'oxc-walker';
import type {
  AstEcmaScriptModule,
  AstFunction,
  AstNode,
  AstParentNode,
  AstParseResult,
  AstProgram,
  JSXAttributeItem,
  JSXElementName,
} from '../../ast-types.js';
import { qwikHash, qwikHashFromSeed } from '../../hashing/siphash.js';
import { escapeSymbol } from '../../hashing/naming.js';
import { parseWithRawTransfer } from '../ast/parse.js';
import { ContextStack } from './context-stack.js';
import {
  collectImports,
  collectCustomInlined,
  getCalleeName,
  isMarkerCall,
  isSyncMarker,
  getExtractionKind,
  getExtractionName,
  type CustomInlinedInfo,
  type ImportInfo,
} from './marker-detection.js';
import { isEventProp, transformEventPropName, collectPassiveDirectives } from '../jsx/event-handlers.js';
import { collectJsxFunctionNamesFromIterable } from '../jsx/jsx-call-transform.js';
import { getBasename, getDirectory, getExtension, getFileStem } from '../../paths.js';
import { detectForeignJsxRuntime } from '../jsx/jsx-import-source.js';
import { getJsxAttributeName } from '../jsx/jsx-attr-name.js';
import { getQrlCalleeName } from '../qwik/qrl-naming.js';
import {
  type BodyText,
  type ByteOffset,
  type CanonicalFilename,
  type CtxName,
  type DisplayName,
  type Hash,
  type Origin,
  type SymbolName,
  mkBodyText,
  mkByteOffset,
  mkCanonicalFilename,
  mkCtxName,
  mkDisplayName,
  mkHash,
  mkOrigin,
  mkSymbolName,
} from '../types/brands.js';

/**
 * Fields shared across all three phases of the extraction pipeline.
 * Once set at extraction time (post-disambig + post-prod-rename +
 * post-transpile-downgrade), these are immutable for the rest of the
 * pipeline. Phase transitions use object spread to carry these forward.
 */
export interface ExtractionBase {
  readonly symbolName: SymbolName;
  readonly displayName: DisplayName;
  readonly hash: Hash;
  readonly canonicalFilename: CanonicalFilename;

  readonly callStart: ByteOffset;
  readonly callEnd: ByteOffset;
  readonly calleeStart: ByteOffset;
  readonly calleeEnd: ByteOffset;
  readonly argStart: ByteOffset;
  readonly argEnd: ByteOffset;

  readonly bodyText: BodyText;

  readonly calleeName: string;
  readonly isBare: boolean;
  readonly isSync: boolean;
  readonly qrlCallee: string;
  readonly importSource: string;

  readonly ctxKind: 'function' | 'eventHandler' | 'jSXProp';
  readonly ctxName: CtxName;
  readonly origin: Origin;
  // Finalised after JSX-detection (leave handler) and transpile-downgrade.
  readonly extension: string;
  // The stripped-segment emission path derives its zeroed loc locally rather
  // than mutating the consolidated extraction.
  readonly loc: readonly [ByteOffset, ByteOffset];

  // Finalised in the extraction walk's `leave` handler before the variant is exposed.
  readonly segmentImports: readonly ImportInfo[];

  readonly isInlinedQrl: boolean;
  readonly explicitCaptures: string | null;
  readonly inlinedQrlNameArg: string | null;

  readonly isComponentEvent: boolean;

  // Extracted from a JSX-factory call's object-property handler
  // (`_jsxDEV("button", { onClick$: () => … })`) rather than a raw JSX
  // attribute. The call site is a bare value (replaced in place with the QRL
  // ref), so `buildNestedCallSites` routes it through the plain call-site path.
  readonly isJsxObjectProp: boolean;
}

/**
 * Phase-spanning fields, mutable for the pipeline's in-place transition pattern
 * (capture analysis, parent rewrite, event-capture promotion all mutate in
 * place). Truly-immutable fields stay readonly on `ExtractionBase`. Consumers
 * narrow on `phase`.
 */
interface ExtractionPhaseFields {
  captureNames: string[];
  paramNames: string[];
  captures: boolean;
  parent: SymbolName | null;
  propsFieldCaptures?: Map<string, string>;
  /**
   * Parallel to `propsFieldCaptures` — for each captured prop field with a
   * destructure-time default (`some = 1+2`), the default expression as source
   * text. Nested segment bodies emit `(_rawProps.<key> ?? <default>)` so the
   * runtime applies the default the way the parent body would. Keyed by
   * local-binding name.
   */
  propsFieldDefaults?: Map<string, string>;
  constLiterals?: Map<string, string>;
}

/**
 * Phase 1 output. `captureNames`/`paramNames` are empty unless pre-populated by
 * the inlinedQrl explicit-captures array. `parent` is `null` until parent
 * rewrite resolves nesting.
 */
export interface ExtractedSegment extends ExtractionBase, ExtractionPhaseFields {
  readonly phase: 'extracted';
}

/** Phase 3 output (post-capture-analysis). */
export interface CapturedSegment extends ExtractionBase, ExtractionPhaseFields {
  readonly phase: 'captured';
}

/**
 * Phase 5 output. `parent` is resolved; `propsFieldCaptures` and `constLiterals`
 * are finalised. Downstream consumers take this variant.
 */
export interface ConsolidatedSegment extends ExtractionBase, ExtractionPhaseFields {
  readonly phase: 'consolidated';
}

/**
 * Discriminated union over the three pipeline phases; consumers narrow on
 * `phase`. `phase` is internal to the optimizer — it does not propagate to the
 * NAPI `SegmentAnalysis` output.
 */
export type ExtractionResult = ExtractedSegment | CapturedSegment | ConsolidatedSegment;

/**
 * Strip `readonly` from every property of `T`. Phase-transition code casts an
 * input array to the next phase's mutable builder, mutates in place, and returns
 * it typed as the readonly next-phase variant; external consumers see the
 * readonly union and narrow via `phase`.
 */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** Builder type for the extraction walker's WIP segment state. */
export type ExtractedSegmentBuilder = Mutable<ExtractedSegment>;

/** Builder type for capture analysis (Phase 3). */
export type CapturedSegmentBuilder = Mutable<CapturedSegment>;

/** Builder type for parent rewrite (Phase 5). */
export type ConsolidatedSegmentBuilder = Mutable<ConsolidatedSegment>;

function nodeContainedIn(inner: AstNode, outer: AstNode): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

function extensionFromSegmentJsx(hasJsx: boolean, sourceExt: string): string {
  if (hasJsx) return '.tsx';
  if (sourceExt === '.ts') return '.ts';
  return '.js';
}

/**
 * `ContextStack` restricted to push/peek/read — `.pop()` is intentionally
 * absent so the enter handler can't corrupt the context-stack/pushedNodes
 * pairing (popping is exit-only). Same instance the exit handler sees as the
 * full type.
 */
type ContextStackForEnter = Pick<
  ContextStack,
  'push' | 'pushDefaultExport' | 'getDisplayName' | 'getSymbolName' | 'peek'
>;

/**
 * Enter-phase context for the extraction walker. `activeSegmentBodies` is
 * readonly at the array level so enter can read the top frame and mutate its
 * fields but can't pop — popping is exit-only.
 */
interface ExtractWalkEnterContext {
  readonly source: string;
  readonly relPath: string;
  readonly scope: string | undefined;
  readonly transpileJsx: boolean | undefined;
  /**
   * Fired once per discovered extraction at the creation node's enter, before
   * the walker descends into the closure body. The fused gather walk uses it to
   * register the closure node for its projections, keyed by extraction object
   * identity (symbolName isn't final until `disambiguateExtractions` runs).
   */
  readonly onExtraction?: (
    extraction: ExtractedSegment,
    closureNode: AstFunction | null,
  ) => void;
  /**
   * The user's explicit `transpileJsx` value (defaults false). Distinct from the
   * derived `transpileJsx` above, which defaults TRUE for `.tsx`/`.jsx`. The
   * ctxKind classifier needs the strict semantic.
   */
  readonly explicitTranspileJsx: boolean;
  readonly sourceExt: string;
  readonly defaultExtension: string;
  readonly fileStem: string;
  readonly fileName: string;
  readonly imports: Map<string, ImportInfo>;
  readonly customInlined: Map<string, CustomInlinedInfo>;
  readonly hasNonQwikJsxImportSource: boolean;
  /**
   * Local names that resolve to a Qwik JSX-runtime function (`jsx` / `jsxs` /
   * `jsxDEV` from `@qwik.dev/core`, or anything from `@qwik.dev/core/jsx-runtime`
   * / `.../jsx-dev-runtime`). Used to push naming context for peer-tool
   * `jsx('tag', { onProp$: ... })` calls the same way JSX syntax does.
   */
  readonly jsxFunctions: ReadonlySet<string>;
  /**
   * Tagged ObjectExpressions that are the props-bag (second arg) of a recognised
   * JSX-runtime call. Tag value is the tag-kind from the first arg —
   * string-literal → `'html'`, identifier → `'component'`.
   */
  readonly jsxPropObjects: Map<AstNode, 'html' | 'component'>;
  readonly naming: ContextStackForEnter;
  readonly activeSegmentBodies: readonly ActiveSegmentBody[];
  readonly pendingClosures: Array<{ extraction: ExtractionResult; node: AstFunction }>;
  readonly pushedNodes: Map<AstNode, number>;
  readonly parentMap: Map<AstNode, AstParentNode>;
  readonly results: ExtractedSegmentBuilder[];
  readonly pushActiveSegmentBody: (frame: ActiveSegmentBody) => void;
}

/**
 * Exit-phase context: extends the enter context with the two exit-only
 * act-helpers and widens `naming` back to the full `ContextStack` so they can
 * `.pop()`. Calling either helper from the enter handler is a compile error.
 */
interface ExtractWalkExitContext extends Omit<ExtractWalkEnterContext, 'naming'> {
  readonly naming: ContextStack;
  readonly finaliseTopFrameIfMatches: (node: AstNode) => void;
  readonly popContextStackForNode: (node: AstNode) => void;
}

/** Open segment bodies during the program walk — used to fold JSX detection into this walk without extra subtree walks. */
type ActiveSegmentBody = {
  leaveNode: AstNode;
  root: AstNode;
  /**
   * The WIP segment under construction, mutated during the walker's `leave`
   * handler (extension flip, segmentImports). Exposed as the readonly
   * `ExtractedSegment` once the walker completes.
   */
  result: ExtractedSegmentBuilder;
  hasJsx: boolean;
  /**
   * When set, the outer walk accumulates referenced Identifier names here as it
   * descends. On `leave`, `segmentImports` is computed from this set instead of
   * re-walking the body — avoids an O(extractionCount × programSize) cost.
   */
  bodyIds?: Set<string>;
};

/** Resolve aliased import back to its original name (e.g., `c$` -> `component$`). */
function resolveCanonicalCalleeName(
  calleeName: string,
  imports: Map<string, ImportInfo>,
): string {
  const importInfo = imports.get(calleeName);
  return importInfo ? importInfo.importedName : calleeName;
}

/**
 * When a marker call's single argument is an `Identifier` resolving to an import
 * binding, segments derive their displayName + hash from the import path rather
 * than the surrounding context stack — so `useStyles$(css3)` with
 * `import css3 from './style.css'` produces `style_css` / a hash of
 * `./style.css#default`, stable across files importing the same asset. Returns
 * null for non-Identifier args or Identifiers that don't resolve to an import;
 * callers fall back to stack-based naming.
 *
 * Scope is narrow: single-Identifier only; the namespace-member form
 * (`useStyles$(ns.foo)`) is unsupported — extend when a fixture needs it.
 */
function getImportArgNaming(
  arg: AstNode,
  imports: Map<string, ImportInfo>,
  relPath: string,
): { importContextPortion: string; hashSeed: string } | null {
  if (arg.type !== 'Identifier') return null;
  const importInfo = imports.get(arg.name);
  if (!importInfo) return null;

  // The hash seed and path-tail use the resolved form: without resolution,
  // `./style.css` would hash differently from `style.css` even though both
  // name the same module.
  const resolvedSource = resolveImportHashPath(importInfo.source, relPath);

  const slashIdx = resolvedSource.lastIndexOf('/');
  const pathTail = slashIdx >= 0 ? resolvedSource.slice(slashIdx + 1) : resolvedSource;
  const baseName = escapeSymbol(pathTail);
  const importContextPortion = importInfo.importedName === 'default'
    ? baseName
    : `${baseName}_${escapeSymbol(importInfo.importedName)}`;

  const hashSeed = `${resolvedSource}#${importInfo.importedName}`;

  return { importContextPortion, hashSeed };
}

/**
 * Absolute / bare specifiers pass through; relative paths resolve against the
 * directory of `relPath`.
 */
function resolveImportHashPath(importPath: string, relPath: string): string {
  const normalized = importPath.replace(/\\/g, '/');
  if (!normalized.startsWith('.')) return normalized;

  const baseDir = getDirectory(relPath);
  const segments = baseDir.split('/').filter((s) => s !== '');
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return normalized;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

/**
 * Bare $() segments inherit the wrapper call name as naming context,
 * e.g., component($(() => {})) -> "..._component".
 */
function getDirectWrapperContextName(
  node: AstNode,
  parent: AstParentNode,
  imports: Map<string, ImportInfo>,
  customInlined: Map<string, CustomInlinedInfo>,
): string | null {
  if (parent?.type !== 'CallExpression') return null;
  if (!parent.arguments.some((arg) => arg === node)) {
    return null;
  }
  if (isMarkerCall(parent, imports, customInlined)) return null;

  const wrapperCallee = getCalleeName(parent);
  if (!wrapperCallee) return null;

  return resolveCanonicalCalleeName(wrapperCallee, imports);
}

function collectIdentifiers(node: AstNode): Set<string> {
  const ids = new Set<string>();
  walk(node, {
    enter(n: AstNode) {
      if (n.type === 'Identifier') {
        ids.add(n.name);
      }
    },
  });
  return ids;
}

/**
 * File-level imports referenced by the given identifier set. Hot path feeds the
 * Set accumulated during the outer walk (no extra walk); cold path falls back to
 * `collectSegmentImports`, which re-walks the body.
 */
function filterImportsByIds(
  ids: Set<string>,
  imports: Map<string, ImportInfo>,
): ImportInfo[] {
  const result: ImportInfo[] = [];
  for (const [localName, info] of imports) {
    if (ids.has(localName)) result.push(info);
  }
  return result;
}

function collectSegmentImports(bodyNode: AstNode, imports: Map<string, ImportInfo>): ImportInfo[] {
  return filterImportsByIds(collectIdentifiers(bodyNode), imports);
}

function isComponentTag(tagNode: JSXElementName | null | undefined): boolean {
  if (tagNode?.type === 'JSXIdentifier') {
    const ch = tagNode.name[0];
    return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
  }
  // Member expressions like Foo.Bar are always components
  return tagNode?.type === 'JSXMemberExpression';
}

/** `on*$` (incl. `document:on*$` / `window:on*$`) event-attribute name shape. */
const onEventAttrName = /^(?:document:|window:)?on[A-Z-]/;

/**
 * The hash is the suffix after the last underscore of a stack-composed symbol
 * name (`renderHeader1_jMxQsjbyDss`); a name with no underscore is used whole.
 */
function hashFromSymbolName(symbolName: SymbolName): Hash {
  const lastUnder = symbolName.lastIndexOf('_');
  return mkHash(lastUnder >= 0 ? symbolName.slice(lastUnder + 1) : symbolName);
}

/**
 * Two-rule ctxKind classification shared by the JSX-attribute and
 * pre-transformed JSX object-prop paths. `explicitTranspileJsx` true → element-
 * kind rule (Component → jSXProp); false → name-prefix rule (`on*$` →
 * eventHandler regardless of element kind). The marker-call-inside-JSX-attribute
 * path has its own name-prefix rule and deliberately doesn't share this helper.
 */
function classifyJsxHandlerCtxKind(
  propName: string,
  isComponentEvent: boolean,
  explicitTranspileJsx: boolean,
): 'eventHandler' | 'jSXProp' {
  if (explicitTranspileJsx) {
    return isComponentEvent ? 'jSXProp' : 'eventHandler';
  }
  const isOnEventAttr = onEventAttrName.test(propName);
  return isComponentEvent && !isOnEventAttr ? 'jSXProp' : 'eventHandler';
}

/**
 * Per-path inputs for {@link buildExtractedSegment}. Required fields are those
 * that diverge between the four extraction paths; optional fields are per-path
 * overrides of a shared default. Derivations and empty collections live in the
 * factory, so adding an `ExtractionBase` field is a one-site change.
 */
interface ExtractedSegmentSpec {
  readonly symbolName: SymbolName;
  readonly displayName: DisplayName;
  readonly hash: Hash;
  readonly callStart: number;
  readonly callEnd: number;
  readonly calleeStart: number;
  readonly calleeEnd: number;
  readonly argStart: number;
  readonly argEnd: number;
  readonly bodyText: string;
  readonly calleeName: string;
  readonly ctxKind: 'function' | 'eventHandler' | 'jSXProp';
  readonly ctxName: CtxName;
  readonly relPath: string;
  readonly extension: string;
  readonly isBare?: boolean;
  readonly isSync?: boolean;
  readonly qrlCallee?: string;
  readonly importSource?: string;
  readonly captureNames?: string[];
  readonly segmentImports?: ImportInfo[];
  readonly isInlinedQrl?: boolean;
  readonly explicitCaptures?: string | null;
  readonly inlinedQrlNameArg?: string | null;
  readonly isComponentEvent?: boolean;
  readonly isJsxObjectProp?: boolean;
}

/** Single construction point for Phase 1 extraction records. */
function buildExtractedSegment(spec: ExtractedSegmentSpec): ExtractedSegmentBuilder {
  const captureNames = spec.captureNames ?? [];
  return {
    phase: 'extracted',
    symbolName: spec.symbolName,
    displayName: spec.displayName,
    hash: spec.hash,
    canonicalFilename: mkCanonicalFilename(spec.displayName + '_' + spec.hash),
    callStart: mkByteOffset(spec.callStart),
    callEnd: mkByteOffset(spec.callEnd),
    calleeStart: mkByteOffset(spec.calleeStart),
    calleeEnd: mkByteOffset(spec.calleeEnd),
    argStart: mkByteOffset(spec.argStart),
    argEnd: mkByteOffset(spec.argEnd),
    bodyText: mkBodyText(spec.bodyText),
    calleeName: spec.calleeName,
    isBare: spec.isBare ?? false,
    isSync: spec.isSync ?? false,
    qrlCallee: spec.qrlCallee ?? '',
    importSource: spec.importSource ?? '',
    ctxKind: spec.ctxKind,
    ctxName: spec.ctxName,
    origin: mkOrigin(spec.relPath),
    extension: spec.extension,
    // `loc` carries byte offsets, not line/col — the `[byteStart, byteEnd]`
    // contract the snap fixtures encode.
    loc: [mkByteOffset(spec.argStart), mkByteOffset(spec.argEnd)],
    parent: null,
    captures: captureNames.length > 0,
    captureNames,
    paramNames: [],
    // Empty unless overridden; collected in the walker's leave handler via bodyIds.
    segmentImports: spec.segmentImports ?? [],
    isInlinedQrl: spec.isInlinedQrl ?? false,
    explicitCaptures: spec.explicitCaptures ?? null,
    inlinedQrlNameArg: spec.inlinedQrlNameArg ?? null,
    isComponentEvent: spec.isComponentEvent ?? false,
    isJsxObjectProp: spec.isJsxObjectProp ?? false,
  };
}

/** Per-host options for {@link createExtractionCollector}. */
export interface ExtractionCollectorOptions {
  readonly source: string;
  readonly relPath: string;
  readonly program: AstProgram;
  readonly parserModule?: AstEcmaScriptModule;
  readonly scope?: string;
  readonly transpileJsx?: boolean;
  /** See the `explicitTranspileJsx` parameter of {@link extractSegments}. */
  readonly explicitTranspileJsx?: boolean;
  /** See the `closureNodesOut` parameter of {@link extractSegments}. */
  readonly closureNodesOut?: Map<string, AstFunction>;
  /** See {@link ExtractWalkEnterContext.onExtraction}. */
  readonly onExtraction?: (
    extraction: ExtractedSegment,
    closureNode: AstFunction | null,
  ) => void;
}

/**
 * The Phase-1 extraction walk as a composable collector: per-node enter/leave
 * handlers plus a post-walk `finish`. Two hosts drive it — `extractSegments`
 * (standalone, retained as the differential oracle) and `gatherModuleFacts` (the
 * canonical gather walk, sharing its single traversal). The enter/exit protocol
 * is enforced by the split context views: host walks cannot cross the phases.
 */
export interface ExtractionCollector {
  enter(node: AstNode, parent: AstNode | null): void;
  leave(node: AstNode): void;
  /**
   * Post-walk act: disambiguate colliding display names, populate
   * `closureNodesOut`, and expose the WIP builders as readonly `ExtractedSegment`.
   * Call exactly once, after the host walk completes.
   */
  finish(): readonly ExtractedSegment[];
}

export function createExtractionCollector(
  options: ExtractionCollectorOptions,
): ExtractionCollector {
  const { source, relPath, scope, transpileJsx, program } = options;
  const explicitTranspileJsx = options.explicitTranspileJsx;
  const closureNodesOut = options.closureNodesOut;

  const imports = collectImports(program, options.parserModule);
  const customInlined = collectCustomInlined(program);

  const relDir = getDirectory(relPath);
  const fileStem = getFileStem(relPath) === 'index' && relDir
    ? getBasename(relDir)
    : getBasename(relPath);
  const sourceExt = getExtension(relPath) || '.js';
  const defaultExtension = extensionFromSegmentJsx(false, sourceExt);
  const fileName = getBasename(relPath);
  const naming = new ContextStack(fileStem, relPath, scope, fileName);

  // The walker builds WIP segments via mutation (push on enter, mutate
  // on leave). The function returns `readonly ExtractedSegment[]` at the
  // boundary — the mutation is internal-only. See `ExtractedSegmentBuilder`.
  const results: ExtractedSegmentBuilder[] = [];
  const activeSegmentBodies: ActiveSegmentBody[] = [];
  /**
   * Pairings of (extraction → its closure AST node) collected during the walk.
   * Populated into `closureNodesOut` after `disambiguateExtractions` mutates
   * `symbolName` in place — extraction object identity stays stable through
   * the rename, so the pairing remains correct.
   */
  const pendingClosures: Array<{ extraction: ExtractionResult; node: AstFunction }> = [];

  const pushedNodes = new Map<AstNode, number>();
  const parentMap = new Map<AstNode, AstParentNode>();

  // Suppress JSX $-suffixed attribute extraction when a non-Qwik
  // @jsxImportSource is set. The shared helper also detects the pragma
  // text for downstream phases (parent rewrite, segment codegen).
  const hasNonQwikJsxImportSource = detectForeignJsxRuntime(source).hasForeignJsxRuntime;

  // Identify local bindings that resolve to a Qwik JSX-runtime callable.
  // Re-uses the same predicate used in segment codegen for the
  // `jsx() → _jsxSorted` rewrite. Empty when the file imports no
  // jsx-runtime names (e.g. pure JSX-syntax sources); the walker
  // short-circuits cheaply.
  const jsxFunctions: ReadonlySet<string> = collectJsxFunctionNamesFromIterable(
    imports.values(),
  );
  const jsxPropObjects = new Map<AstNode, 'html' | 'component'>();

  // Split walk state into Enter and Exit context views so the type system
  // enforces "enter pushes, leave pops." Enter sees `naming` as a
  // push-only `ContextStackForEnter`; Exit sees the full `ContextStack`
  // plus the two act-helpers. Calling `ctx.naming.pop()` or
  // `ctx.popContextStackForNode(node)` from the enter handler is a
  // compile error.
  const enterCtx: ExtractWalkEnterContext = {
    source,
    relPath,
    scope,
    transpileJsx,
    explicitTranspileJsx: explicitTranspileJsx === true,
    onExtraction: options.onExtraction,
    sourceExt,
    defaultExtension,
    fileStem,
    fileName,
    imports,
    customInlined,
    hasNonQwikJsxImportSource,
    jsxFunctions,
    jsxPropObjects,
    naming,
    activeSegmentBodies,
    pendingClosures,
    pushedNodes,
    parentMap,
    results,
    pushActiveSegmentBody: (frame) => { activeSegmentBodies.push(frame); },
  };

  const exitCtx: ExtractWalkExitContext = {
    ...enterCtx,
    naming,
    finaliseTopFrameIfMatches: (node) => {
      const activeTop = activeSegmentBodies[activeSegmentBodies.length - 1];
      if (activeTop?.leaveNode === node) {
        if (activeTop.hasJsx) {
          activeTop.result.extension = extensionFromSegmentJsx(true, sourceExt);
        }
        if (activeTop.bodyIds) {
          activeTop.result.segmentImports = filterImportsByIds(activeTop.bodyIds, imports);
        }
        activeSegmentBodies.pop();
      }
    },
    popContextStackForNode: (node) => {
      const count = pushedNodes.get(node);
      if (count !== undefined) {
        for (let i = 0; i < count; i++) {
          naming.pop();
        }
        pushedNodes.delete(node);
      }
    },
  };

  const handlers = {
    enter(node: AstNode, parent: AstParentNode, ctx: ExtractWalkEnterContext): void {
      if (parent) ctx.parentMap.set(node, parent);

      // Accumulate Identifier names into each active body's deferred set so
      // `segmentImports` is computed on leave without a per-extraction body-walk.
      // Gate on `nodeContainedIn(node, seg.root)` so the enclosing marker
      // callee (`$`, `useTask$`, …) doesn't leak into bodyIds — otherwise the
      // segment would emit a spurious `import { $ }` for the marker wrapping it.
      if (node.type === 'Identifier' && node.name) {
        for (const seg of ctx.activeSegmentBodies) {
          if (seg.bodyIds && nodeContainedIn(node, seg.root)) {
            seg.bodyIds.add(node.name);
          }
        }
      }

      if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
        for (const seg of ctx.activeSegmentBodies) {
          if (!seg.hasJsx && nodeContainedIn(node, seg.root)) {
            seg.hasJsx = true;
          }
        }
      }

      let pushCount = 0;

      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
        ctx.naming.push(node.id.name);
        pushCount++;
      }

      if (node.type === 'FunctionDeclaration' && node.id) {
        ctx.naming.push(node.id.name);
        pushCount++;
      }

      if (node.type === 'Property' && node.key?.type === 'Identifier') {
        // When the surrounding ObjectExpression was tagged as a peer-tool JSX
        // props bag (see the JSX-runtime CallExpression arm below), apply the
        // same naming rules JSX syntax uses for `<tag onProp$=...>` —
        // `q_e_<event>` for HTML tags, `<key without $>` for components.
        const jsxKind = parent?.type === 'ObjectExpression'
          ? ctx.jsxPropObjects.get(parent)
          : undefined;
        const rawKey = node.key.name;
        // Skip the `children` key when naming a JSX props bag, so a handler
        // nested under `{ children: _jsxDEV("button", …) }` is named
        // `…_button_…`, not `…_children_button_…`. Only tagged JSX bags — a
        // plain object literal's `children` key still contributes to naming.
        if (!(jsxKind && rawKey === 'children')) {
          let pushedKey: string;
          if (jsxKind && rawKey.endsWith('$')) {
            if (jsxKind === 'component') {
              pushedKey = rawKey.slice(0, -1);
            } else {
              // HTML tag — match the JSX-attribute event-handler branch. Passive
              // directives aren't a props-bag concept, so pass an empty Set;
              // `transformEventPropName` falls back to raw-name push for
              // non-event props.
              const transformed = transformEventPropName(rawKey, new Set());
              pushedKey = transformed
                ? transformed.replace(/[-:]/g, '_')
                : rawKey;
            }
          } else {
            pushedKey = rawKey;
          }
          ctx.naming.push(pushedKey);
          pushCount++;
        }
      }

      if (node.type === 'MethodDefinition' && node.key?.type === 'Identifier') {
        ctx.naming.push(node.key.name);
        pushCount++;
      }

      // Non-marker $-suffixed calls still contribute to naming (e.g., useMemo$() -> "useMemo")
      if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
        const calleeName = node.callee.name;
        if (calleeName.endsWith('$') && !isMarkerCall(node, imports, customInlined)) {
          ctx.naming.push(calleeName.slice(0, -1));
          pushCount++;
        } else if (
          // Peer-tool `jsx('tag', { onProp$: ... })` calls: push the tag from
          // arg[0] before descending into the props bag, so a `$()` segment
          // inside the bag inherits the tag in its displayName — the peer-tool
          // form of the `JSXElement` branch below (qwik-react codegen etc.).
          ctx.jsxFunctions.has(calleeName) &&
          node.arguments &&
          node.arguments.length >= 2
        ) {
          const tagArg = node.arguments[0];
          const propsArg = node.arguments[1];
          if (propsArg?.type === 'ObjectExpression') {
            let tagPush: string | null = null;
            let tagKind: 'html' | 'component' | null = null;
            if (tagArg?.type === 'Literal' && typeof tagArg.value === 'string') {
              tagPush = tagArg.value;
              tagKind = 'html';
            } else if (tagArg?.type === 'Identifier') {
              tagPush = tagArg.name;
              tagKind = 'component';
            }
            // Member-expression or other non-pushable tag (e.g. `jsx(M.N, ...)`):
            // no push, but still tag the props bag so child Property keys use the
            // component-style rule (strip `$`) rather than the literal push.
            if (tagPush) {
              ctx.naming.push(tagPush);
              pushCount++;
            }
            if (tagKind) {
              ctx.jsxPropObjects.set(propsArg, tagKind);
            } else {
              // Default unknown tag kind to component-style stripping (for
              // non-literal-string tag expressions).
              ctx.jsxPropObjects.set(propsArg, 'component');
            }
          }
        }
      }

      // Push the tag name on JSXElement (not JSXOpeningElement) so it stays on
      // the stack for all children — JSXOpeningElement is a sibling of children,
      // so pushing there would pop before them.
      if (node.type === 'JSXElement' && node.openingElement) {
        const opening = node.openingElement;
        const tagName =
          opening.name?.type === 'JSXIdentifier'
            ? opening.name.name
            : opening.name?.type === 'JSXMemberExpression'
              ? opening.name.property?.name ?? ''
              : '';
        if (tagName) {
          ctx.naming.push(tagName);
          pushCount++;
        }
      }

      // `<>` becomes `jsx(Fragment, ...)` only under transpileJsx, so Fragment
      // enters the naming context only then.
      if (node.type === 'JSXFragment' && transpileJsx) {
        ctx.naming.push('Fragment');
        pushCount++;
      }

      if (node.type === 'JSXAttribute') {
        const rawAttrName = getJsxAttributeName(node);
        if (rawAttrName.endsWith('$') && isEventProp(rawAttrName)) {
          const isComponentElement = parent?.type === 'JSXOpeningElement' && isComponentTag(parent.name);
          if (isComponentElement) {
            ctx.naming.push(rawAttrName.slice(0, -1));
          } else {
            const jsxOpening = parent?.type === 'JSXOpeningElement' ? parent : null;
            const siblingAttrs: JSXAttributeItem[] = jsxOpening?.attributes ?? [];
            const passiveEvents = collectPassiveDirectives(siblingAttrs);
            const transformed = transformEventPropName(rawAttrName, passiveEvents);
            if (transformed) {
              ctx.naming.push(transformed.replace(/[-:]/g, '_'));
            } else {
              ctx.naming.push(rawAttrName);
            }
          }
        } else if (rawAttrName.endsWith('$') && rawAttrName.startsWith('host:')) {
          const stripped = rawAttrName.slice(5, -1);
          ctx.naming.push('host_' + stripped);
        } else {
          ctx.naming.push(rawAttrName);
        }
        pushCount++;
      }

      if (node.type === 'ExportDefaultDeclaration') {
        const decl = node.declaration;
        const hasName =
          (decl?.type === 'FunctionDeclaration' && decl.id) ||
          (decl?.type === 'ClassDeclaration' && decl.id);
        if (!hasName) {
          ctx.naming.pushDefaultExport();
          pushCount++;
        }
      }

      // inlinedQrl is a pre-processed QRL — must be detected before regular marker calls
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        (node.callee.name === 'inlinedQrl' || node.callee.name === '_inlinedQrl') &&
        imports.get(node.callee.name)?.isQwikCore &&
        node.arguments?.length >= 2
      ) {
        const calleeName = node.callee.name;
        const arg0 = node.arguments[0];
        const arg1 = node.arguments[1];
        const arg2 = node.arguments[2];

        const nameValue = arg1?.type === 'Literal' && typeof arg1.value === 'string'
            ? arg1.value
            : null;

        const isNullBody = arg0?.type === 'Literal' && arg0.value === null;

        if (arg0 && nameValue && !isNullBody) {
          const bodyText = source.slice(arg0.start, arg0.end);

          // Split into display + hash portion. The 8+-alphanumeric gate matches
          // `HASH_SHAPE` in `types/brands.ts`, so `lastPart` is always a valid `Hash`.
          const lastUnder = nameValue.lastIndexOf('_');
          let inlinedHash: Hash;
          let displayNameSuffix: string;
          if (lastUnder > 0) {
            const lastPart = nameValue.slice(lastUnder + 1);
            if (lastPart.length >= 8 && /^[a-zA-Z0-9]+$/.test(lastPart)) {
              inlinedHash = mkHash(lastPart);
              displayNameSuffix = nameValue.slice(0, lastUnder);
            } else {
              inlinedHash = mkHash(nameValue);
              displayNameSuffix = nameValue;
            }
          } else {
            inlinedHash = mkHash(nameValue);
            displayNameSuffix = nameValue;
          }

          const inlinedDisplayName = mkDisplayName(fileStem + '_' + displayNameSuffix);

          let explicitCapturesText: string | null = null;
          const inlinedCaptureNames: string[] = [];
          if (arg2?.type === 'ArrayExpression') {
            explicitCapturesText = source.slice(arg2.start, arg2.end);
            for (const elem of arg2.elements ?? []) {
              if (elem?.type === 'Identifier') {
                inlinedCaptureNames.push(elem.name);
              }
            }
          }

          // Derive ctxName from wrapping Qrl call (e.g., componentQrl(...) -> "component$")
          let inlinedCtxName = nameValue;
          if (parent?.type === 'CallExpression') {
            const parentCallee = getCalleeName(parent);
            if (parentCallee) {
              const canonicalParentCallee = resolveCanonicalCalleeName(parentCallee, imports);
              if (canonicalParentCallee.endsWith('Qrl')) {
                inlinedCtxName = canonicalParentCallee.slice(0, -3) + '$';
              } else {
                inlinedCtxName = canonicalParentCallee;
              }
            }
          }

          // Initial value; a function `arg0` whose body has JSX gets its
          // extension flipped in the leave handler. Static-value `arg0` keeps
          // `sourceExt`.
          const extension = sourceExt;

          // Function arg0 defers segmentImports collection to the outer walk;
          // non-function arg0 (rare cold path) falls back to the inline sub-walk.
          let inlinedSegmentImports: ImportInfo[] = [];
          if (
            arg0.type !== 'ArrowFunctionExpression' &&
            arg0.type !== 'FunctionExpression'
          ) {
            inlinedSegmentImports = collectSegmentImports(arg0, ctx.imports);
          }

          const extraction = buildExtractedSegment({
            symbolName: mkSymbolName(nameValue),
            displayName: inlinedDisplayName,
            hash: inlinedHash,
            callStart: node.start,
            callEnd: node.end,
            calleeStart: node.callee.start,
            calleeEnd: node.callee.end,
            argStart: arg0.start,
            argEnd: arg0.end,
            bodyText,
            calleeName,
            importSource: imports.get(calleeName)?.source ?? '@qwik.dev/core',
            ctxKind: 'function',
            ctxName: mkCtxName(inlinedCtxName),
            relPath,
            extension,
            captureNames: inlinedCaptureNames,
            segmentImports: inlinedSegmentImports,
            isInlinedQrl: true,
            explicitCaptures: explicitCapturesText,
            inlinedQrlNameArg: nameValue,
          });
          ctx.results.push(extraction);
          if (
            arg0.type === 'ArrowFunctionExpression' ||
            arg0.type === 'FunctionExpression'
          ) {
            // Same JSX-detection as other extractions: JSX in arg0's body flips
            // the extension in the leave handler. Defensive — current peer tools
            // pre-transform JSX, but the gate must be ready for those that don't.
            ctx.pushActiveSegmentBody({
              leaveNode: node,
              root: arg0,
              result: extraction,
              hasJsx: false,
              bodyIds: new Set<string>(),
            });
            ctx.pendingClosures.push({ extraction, node: arg0 });
            ctx.onExtraction?.(extraction, arg0);
          } else {
            ctx.onExtraction?.(extraction, null);
          }
        }

        if (pushCount > 0) ctx.pushedNodes.set(node, pushCount);
        return;
      }

      if (node.type === 'CallExpression' && isMarkerCall(node, ctx.imports, ctx.customInlined)) {
        const calleeName = getCalleeName(node);
        if (!calleeName) {
          if (pushCount > 0) ctx.pushedNodes.set(node, pushCount);
          return;
        }

        const canonicalCallee = resolveCanonicalCalleeName(calleeName, imports);

        const wrapperContext = canonicalCallee === '$'
          ? getDirectWrapperContextName(node, parent, imports, customInlined)
          : null;
        if (wrapperContext) {
          ctx.naming.push(wrapperContext);
          pushCount++;
        }

        // Bare `$()` doesn't push the callee — only wrapper context + counter matter.
        if (canonicalCallee !== '$') {
          ctx.naming.push(calleeName);
          pushCount++;
        }

        const arg = node.arguments?.[0];
        if (!arg) {
          if (pushCount > 0) ctx.pushedNodes.set(node, pushCount);
          return;
        }

        const bodyText = source.slice(arg.start, arg.end);
        const isBare = canonicalCallee === '$';
        const isSync = isSyncMarker(canonicalCallee);
        const qrlCallee = getQrlCalleeName(canonicalCallee);

        // Detect if this $() call is inside a JSX attribute (CallExpr -> JSXExprContainer -> JSXAttr)
        let isEventAttr = false;
        let isJsxNonEventAttr = false;
        let attrCtx: string | undefined;

        if (parent?.type === 'JSXExpressionContainer') {
          const jsxAttrParent = parentMap.get(parent);
          if (jsxAttrParent?.type === 'JSXAttribute') {
            const jsxAttrName = getJsxAttributeName(jsxAttrParent);
            if (jsxAttrName.endsWith('$')) {
              attrCtx = ctx.naming.peek(1) ?? jsxAttrName;

              // ctxKind has two classification paths gated on transpileJsx: the
              // element-kind rule (Component vs HTML) when set, the name-prefix
              // rule (`on*$`) when not. This optimizer always sees raw JSX, so
              // the gate is explicit here.
              const jsxOpeningElement = parentMap.get(jsxAttrParent);
              const isComponentElement = jsxOpeningElement?.type === 'JSXOpeningElement'
                && isComponentTag(jsxOpeningElement.name);

              if (ctx.explicitTranspileJsx) {
                // Element-kind rule: HTML → eventHandler; Component → jSXProp.
                if (isComponentElement) {
                  isEventAttr = false;
                  isJsxNonEventAttr = true;
                } else {
                  isEventAttr = true;
                  isJsxNonEventAttr = false;
                }
              } else {
                // Name-prefix rule: `on*$` (incl. `document:on*$` / `window:on*$`)
                // → eventHandler; anything else → jSXProp.
                const isOnEventAttr = onEventAttrName.test(jsxAttrName);
                if (isOnEventAttr) {
                  isEventAttr = true;
                  isJsxNonEventAttr = false;
                } else {
                  isEventAttr = false;
                  isJsxNonEventAttr = true;
                }
              }
            }
          }
        }

        const ctxKind = getExtractionKind(canonicalCallee, isEventAttr, isJsxNonEventAttr);
        const isJsxAttrContext = isEventAttr || isJsxNonEventAttr;
        const ctxName = mkCtxName(getExtractionName(canonicalCallee, isJsxAttrContext, isJsxAttrContext ? attrCtx : undefined));

        // When the marker's first arg is a single Identifier resolving to an
        // import binding, derive displayName + hash from the import path so the
        // segment name stays stable across files importing the same asset. Falls
        // back to stack-based naming when the helper returns null.
        const importNaming = !isJsxAttrContext && !isBare
          ? getImportArgNaming(arg, imports, relPath)
          : null;

        let displayName: DisplayName;
        let symbolName: SymbolName;
        let hash: Hash;
        if (importNaming !== null) {
          const fileStem = getBasename(relPath);
          displayName = mkDisplayName(`${fileStem}_${importNaming.importContextPortion}`);
          hash = qwikHashFromSeed(importNaming.hashSeed);
          symbolName = mkSymbolName(`${importNaming.importContextPortion}_${hash}`);
        } else {
          displayName = ctx.naming.getDisplayName();
          symbolName = ctx.naming.getSymbolName();
          hash = hashFromSymbolName(symbolName);
        }

        const extraction = buildExtractedSegment({
          symbolName,
          displayName,
          hash,
          callStart: node.start,
          callEnd: node.end,
          calleeStart: node.callee.start,
          calleeEnd: node.callee.end,
          argStart: arg.start,
          argEnd: arg.end,
          bodyText,
          calleeName: canonicalCallee,
          isBare,
          isSync,
          qrlCallee,
          importSource: imports.get(calleeName)?.source ?? '',
          ctxKind,
          ctxName,
          relPath,
          extension: defaultExtension,
        });
        ctx.results.push(extraction);
        ctx.pushActiveSegmentBody({ leaveNode: node, root: arg, result: extraction, hasJsx: false, bodyIds: new Set<string>() });
        if (
          arg.type === 'ArrowFunctionExpression' ||
          arg.type === 'FunctionExpression'
        ) {
          ctx.pendingClosures.push({ extraction, node: arg });
          ctx.onExtraction?.(extraction, arg);
        } else {
          ctx.onExtraction?.(extraction, null);
        }
      }

      // JSX $-suffixed attribute extraction (e.g., onClick$={expr})
      let jsxAttrName: string | null = null;
      if (
        node.type === 'JSXAttribute' &&
        node.value?.type === 'JSXExpressionContainer' &&
        node.value.expression
      ) {
        const full = getJsxAttributeName(node);
        if (full.endsWith('$')) {
          jsxAttrName = full;
        }
      }
      if (
        jsxAttrName !== null &&
        !hasNonQwikJsxImportSource &&
        node.type === 'JSXAttribute' &&
        node.value?.type === 'JSXExpressionContainer' &&
        node.value.expression
      ) {
        const attrName = jsxAttrName;
        const expr = node.value.expression;

        if (expr.type === 'CallExpression' && isMarkerCall(expr, imports, customInlined)) {
          // Handled by marker call detection above
        } else if (
          expr.type === 'ArrowFunctionExpression' ||
          expr.type === 'FunctionExpression'
        ) {
          const bodyText = source.slice(expr.start, expr.end);

          const isComponentEvent = parent?.type === 'JSXOpeningElement' && isComponentTag(parent.name);

          const ctxKind = classifyJsxHandlerCtxKind(
            attrName,
            isComponentEvent,
            explicitTranspileJsx === true,
          );
          const ctxName = mkCtxName(attrName);

          const displayName = ctx.naming.getDisplayName();
          const symbolName = ctx.naming.getSymbolName();
          const hash = hashFromSymbolName(symbolName);

          const extraction = buildExtractedSegment({
            symbolName,
            displayName,
            hash,
            callStart: node.start,
            callEnd: node.end,
            calleeStart: node.name.start,
            calleeEnd: node.name.end,
            argStart: expr.start,
            argEnd: expr.end,
            bodyText,
            calleeName: attrName,
            ctxKind,
            ctxName,
            relPath,
            extension: defaultExtension,
            isComponentEvent,
          });
          ctx.results.push(extraction);
          ctx.pushActiveSegmentBody({ leaveNode: node, root: expr, result: extraction, hasJsx: false, bodyIds: new Set<string>() });
          // Safe cast: the enclosing if already gated `expr.type` to a function expression.
          ctx.pendingClosures.push({ extraction, node: expr as AstFunction });
          ctx.onExtraction?.(extraction, expr as AstFunction);
        }
      }

      // Pre-transformed JSX: a `$`-suffixed handler in a JSX-factory call's
      // props bag (`_jsxDEV("button", { onClick$: () => … })`). esbuild
      // transpiles `.tsx` to `_jsxDEV(...)` before the optimizer runs, so these
      // handlers arrive as object properties, not JSX attributes. Without this
      // branch they stay inline — never lazy-loaded — and any module-level
      // binding they reference (e.g. `const testServer$ = server$(…)`) gets
      // mis-attributed and dropped. Extract them into their own segment like a
      // JSX attribute. The marker-call form (`onClick$: $(() => …)`) is already
      // caught by the CallExpression walker above, so this handles only bare
      // function values.
      if (
        node.type === 'Property' &&
        !node.computed &&
        !hasNonQwikJsxImportSource &&
        parent?.type === 'ObjectExpression' &&
        ctx.jsxPropObjects.has(parent) &&
        (node.value?.type === 'ArrowFunctionExpression' ||
          node.value?.type === 'FunctionExpression')
      ) {
        let rawKey: string | null = null;
        if (node.key?.type === 'Identifier') {
          rawKey = node.key.name;
        } else if (node.key?.type === 'Literal' && typeof node.key.value === 'string') {
          rawKey = node.key.value;
        }

        if (rawKey !== null && rawKey.endsWith('$')) {
          const propKey = rawKey;
          const value = node.value;
          const bodyText = source.slice(value.start, value.end);

          // HTML-tag props bags get `q-e:click`-style event handlers;
          // component-tag bags pass the `*$` prop through as a JSX prop.
          const jsxKind = ctx.jsxPropObjects.get(parent);
          const isComponentEvent = jsxKind === 'component';

          const ctxKind = classifyJsxHandlerCtxKind(
            propKey,
            isComponentEvent,
            explicitTranspileJsx === true,
          );
          const ctxName = mkCtxName(propKey);

          // The prop key was already pushed by the `Property` naming branch
          // above, so these reflect the full call-site context.
          const displayName = ctx.naming.getDisplayName();
          const symbolName = ctx.naming.getSymbolName();
          const hash = hashFromSymbolName(symbolName);

          const extraction = buildExtractedSegment({
            symbolName,
            displayName,
            hash,
            // Call site is the bare value: replacing `[callStart, callEnd]` with
            // the QRL ref leaves `onClick$: q_<symbol>` for the later
            // `_jsxDEV`→`_jsxSorted` rewrite to rename + slice.
            callStart: value.start,
            callEnd: value.end,
            calleeStart: node.key.start,
            calleeEnd: node.key.end,
            argStart: value.start,
            argEnd: value.end,
            bodyText,
            calleeName: propKey,
            ctxKind,
            ctxName,
            relPath,
            extension: defaultExtension,
            isComponentEvent,
            isJsxObjectProp: true,
          });
          ctx.results.push(extraction);
          ctx.pushActiveSegmentBody({ leaveNode: node, root: value, result: extraction, hasJsx: false, bodyIds: new Set<string>() });
          ctx.pendingClosures.push({ extraction, node: value as AstFunction });
          ctx.onExtraction?.(extraction, value as AstFunction);
        }
      }

      if (pushCount > 0) ctx.pushedNodes.set(node, pushCount);
    },

    leave(node: AstNode, ctx: ExtractWalkExitContext): void {
      ctx.finaliseTopFrameIfMatches(node);
      ctx.popContextStackForNode(node);
    },
  };

  return {
    enter: (node, parent) => handlers.enter(node, parent, enterCtx),
    leave: (node) => handlers.leave(node, exitCtx),
    finish: () => {
      // Pass `fileName` (e.g. "index.tsx"), not `fileStem`: `buildDisplayName`
      // uses it as the strip-prefix, and for routing files `fileStem` differs
      // ("foo" for `routes/foo/index.tsx`), leaving `.tsx` embedded in the
      // contextPortion — which `mkSymbolName` rejects.
      disambiguateExtractions(results, fileName, relPath, scope);

      if (closureNodesOut) {
        for (const { extraction, node } of pendingClosures) {
          closureNodesOut.set(extraction.symbolName, node);
        }
      }

      return results;
    },
  };
}

export function extractSegments(
  source: string,
  relPath: string,
  scope?: string,
  transpileJsx?: boolean,
  preParsedProgram?: AstProgram,
  /** When `preParsedProgram` is set, optional module metadata from the same parse. */
  preParsedModule?: AstEcmaScriptModule,
  /**
   * Optional out-map. When provided, populated with each extraction's closure
   * AST node keyed by the post-disambiguation `symbolName`, so callers skip a
   * per-extraction body re-parse.
   */
  closureNodesOut?: Map<string, AstFunction>,
  /**
   * The user's explicit `transpileJsx` value (defaults false). Distinct from the
   * derived `transpileJsx` above, which defaults TRUE for `.tsx`/`.jsx` when the
   * user omits the flag. The ctxKind classifier needs the strict semantic to
   * select between the name-prefix (default) and element-kind (active) rules.
   */
  explicitTranspileJsx?: boolean,
): readonly ExtractedSegment[] {
  const parseResult: AstParseResult | null = preParsedProgram
    ? null
    : parseWithRawTransfer(relPath, source);
  const program = preParsedProgram ?? parseResult!.program;

  const collector = createExtractionCollector({
    source,
    relPath,
    program,
    parserModule: preParsedProgram ? preParsedModule : parseResult?.module,
    scope,
    transpileJsx,
    explicitTranspileJsx,
    closureNodesOut,
  });

  walk(program, {
    enter(node, parent) {
      collector.enter(node as AstNode, parent as AstNode | null);
    },
    leave(node) {
      collector.leave(node as AstNode);
    },
  });

  return collector.finish();
}

/**
 * Append `_1`, `_2`, … suffixes to extractions that share a display name,
 * recomputing hashes accordingly.
 */
function disambiguateExtractions(
  extractions: ExtractedSegmentBuilder[],
  fileStem: string,
  relPath: string,
  scope?: string,
): void {
  // Mutates identity fields on entries that collide on the displayName context
  // portion; the builder mutability is internal — the boundary exposes
  // `readonly ExtractedSegment[]`.
  const nameCounters = new Map<string, number>();
  const prefix = fileStem + '_';

  for (const ext of extractions) {
    // Peer-tool `inlinedQrl` extractions carry an explicit, already-unique name;
    // appending `_<n>` would rewrite a name the consumer expects and that the
    // prod-rename hash math is computed against verbatim. Skip them.
    if (ext.isInlinedQrl) continue;

    const contextPortion = ext.displayName.startsWith(prefix)
      ? ext.displayName.slice(prefix.length)
      : ext.displayName;

    const existing = nameCounters.get(contextPortion);
    if (existing === undefined) {
      nameCounters.set(contextPortion, 0);
    } else {
      const newIndex = existing + 1;
      nameCounters.set(contextPortion, newIndex);

      const newContext = contextPortion + '_' + newIndex;
      const newHash = qwikHash(scope, relPath, newContext);
      ext.displayName = mkDisplayName(prefix + newContext);
      ext.hash = newHash;
      ext.symbolName = mkSymbolName(newContext + '_' + newHash);
      ext.canonicalFilename = mkCanonicalFilename(ext.displayName + '_' + newHash);
    }
  }
}
