/**
 * Core extraction engine for the Qwik optimizer.
 *
 * Walks an AST to find marker calls ($-suffixed functions), extracts segment
 * info (body text, positions, metadata), and returns an array of ExtractionResult
 * objects. Each result contains everything needed to generate a segment module
 * and rewrite the parent module.
 */

import { walk } from 'oxc-walker';
import { walkWithProtocol } from './utils/walk-with-protocol.js';
import type {
  AstEcmaScriptModule,
  AstFunction,
  AstNode,
  AstParentNode,
  AstParseResult,
  AstProgram,
  JSXAttributeItem,
  JSXElementName,
} from '../ast-types.js';
import { qwikHash, qwikHashFromSeed } from '../hashing/siphash.js';
import { escapeSymbol } from '../hashing/naming.js';
import { parseWithRawTransfer } from './utils/parse.js';
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
import { isEventProp, transformEventPropName, collectPassiveDirectives } from './transform/event-handlers.js';
import { collectJsxFunctionNamesFromIterable } from './transform/jsx-call-transform.js';
import { getBasename, getDirectory, getExtension, getFileStem } from './path-utils.js';
import { detectForeignJsxRuntime } from './utils/jsx-import-source.js';
import { getQrlCalleeName } from './utils/qrl-naming.js';
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
} from './types/brands.js';

/**
 * Fields shared across all three phases of the extraction pipeline.
 * Once set at extraction time (post-disambig + post-prod-rename +
 * post-transpile-downgrade), these are immutable for the rest of the
 * pipeline. Phase transitions use object spread to carry these forward.
 */
export interface ExtractionBase {
  // Identity (final after disambig + prod-rename)
  readonly symbolName: SymbolName;
  readonly displayName: DisplayName;
  readonly hash: Hash;
  readonly canonicalFilename: CanonicalFilename;

  // Positions in original source (for magic-string)
  readonly callStart: ByteOffset;
  readonly callEnd: ByteOffset;
  readonly calleeStart: ByteOffset;
  readonly calleeEnd: ByteOffset;
  readonly argStart: ByteOffset;
  readonly argEnd: ByteOffset;

  // Segment content
  readonly bodyText: BodyText;

  // Call form info
  readonly calleeName: string;
  readonly isBare: boolean;
  readonly isSync: boolean;
  readonly qrlCallee: string;
  readonly importSource: string;

  // Metadata
  readonly ctxKind: 'function' | 'eventHandler' | 'jSXProp';
  readonly ctxName: CtxName;
  readonly origin: Origin;
  // `extension` finalises after JSX-detection (extract leave-handler) and
  // transpile-downgrade — both during extraction-phase construction.
  readonly extension: string;
  // `loc` finalises at extraction time. The stripped-segment emission
  // path in segment-generation derives its zeroed loc locally rather
  // than mutating the consolidated extraction.
  readonly loc: readonly [ByteOffset, ByteOffset];

  // Imports needed by this segment, finalised during the extraction
  // walk's `leave` handler before the variant is exposed.
  readonly segmentImports: readonly ImportInfo[];

  // inlinedQrl support
  readonly isInlinedQrl: boolean;
  readonly explicitCaptures: string | null;
  readonly inlinedQrlNameArg: string | null;

  // Component element event handler (uppercase tag like <CustomComponent onClick$={...}>)
  readonly isComponentEvent: boolean;

  // Extracted from a JSX-factory call's object-property handler
  // (`_jsxDEV("button", { onClick$: () => … })`) rather than a raw JSX
  // attribute (`<button onClick$={() => …}>`). esbuild pre-transforms JSX
  // to `_jsxDEV(...)` before the optimizer runs in the bundler pipeline, so
  // these handlers arrive as object properties. Their call site is a bare
  // value (replaced in place with the QRL ref), not a `name={value}`
  // attribute — `buildNestedCallSites` routes them through the plain
  // call-site path so Phase 5b's `_jsxDEV`→`_jsxSorted` rewrite slices the
  // already-substituted `q_<symbol>`.
  readonly isJsxObjectProp: boolean;
}

/**
 * Phase-spanning fields. Present on all variants; mutable for the
 * pipeline's in-place transition pattern (Phase 1 → 3 capture analysis,
 * Phase 5 parent rewrite, event-capture promotion all mutate in place).
 * The discriminator `phase` narrows the union at consumer sites.
 *
 * Truly-immutable fields (identity, position, body text, ctx, etc.) stay
 * readonly on `ExtractionBase`. The fields here are mutable because the
 * in-place transition pattern is load-bearing for migration mutations
 * downstream — consumers narrow on `phase` and write to the variant-
 * appropriate fields.
 */
interface ExtractionPhaseFields {
  captureNames: string[];
  paramNames: string[];
  captures: boolean;
  parent: SymbolName | null;
  propsFieldCaptures?: Map<string, string>;
  /**
   * Parallel to `propsFieldCaptures` — for each captured prop field that
   * had a destructure-time default (e.g. `some = 1+2`), the default
   * expression as source text. Nested segment bodies emit
   * `(_rawProps.<key> ?? <default>)` for these fields so the runtime
   * applies the default the same way the parent body would. Mirrors
   * SWC's NullishCoalescing emission in `transform_pat`
   * (`swc-reference-only/props_destructuring.rs:382-388`). Keyed by
   * local-binding name (matches `propsFieldCaptures` keying).
   */
  propsFieldDefaults?: Map<string, string>;
  constLiterals?: Map<string, string>;
}

/**
 * Phase 1 output (post-disambig, post-prod-rename, post-transpile-downgrade).
 * `captureNames`/`paramNames` are empty unless pre-populated by the
 * inlinedQrl path's explicit-captures array. `parent` is `null` until
 * parent rewrite resolves nesting.
 */
export interface ExtractedSegment extends ExtractionBase, ExtractionPhaseFields {
  readonly phase: 'extracted';
}

/** Phase 3 output (post-capture-analysis). */
export interface CapturedSegment extends ExtractionBase, ExtractionPhaseFields {
  readonly phase: 'captured';
}

/**
 * Phase 5 output (post-parent-rewrite). `parent` is resolved;
 * `propsFieldCaptures` and `constLiterals` are finalised. Downstream
 * consumers (segment generation, NAPI emit) take this variant.
 */
export interface ConsolidatedSegment extends ExtractionBase, ExtractionPhaseFields {
  readonly phase: 'consolidated';
}

/**
 * Discriminated union over the three pipeline phases. Consumers narrow
 * on `phase` to access phase-specific fields safely.
 *
 * Phase transitions construct new objects via spread:
 * - `extractSegments`/post-extract passes → `ExtractedSegment`
 * - capture analysis: `ExtractedSegment → CapturedSegment`
 * - parent rewrite: `CapturedSegment → ConsolidatedSegment`
 *
 * `phase` is internal to the optimizer; it does NOT propagate to the
 * NAPI `SegmentAnalysis` output (which is constructed from a
 * `ConsolidatedSegment` at segment generation, picking fields).
 */
export type ExtractionResult = ExtractedSegment | CapturedSegment | ConsolidatedSegment;

/**
 * Strip `readonly` from every property of `T`. Used by phase-transition
 * code as an FFI-boundary cast: at the start of a phase-transition
 * function the input array is cast to the next phase's mutable builder
 * type; mutations happen in-place; the function returns the array typed
 * as the readonly next-phase variant. Within a phase, the same pattern
 * applies for the few mutation sites that survive (e.g. event-capture
 * promotion's loop-iteration padding). External consumers see the
 * readonly union and narrow via `phase`.
 */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** Builder type for the extraction walker's WIP segment state. */
export type ExtractedSegmentBuilder = Mutable<ExtractedSegment>;

/** Builder type for capture analysis (Phase 3). */
export type CapturedSegmentBuilder = Mutable<CapturedSegment>;

/** Builder type for parent rewrite (Phase 5). */
export type ConsolidatedSegmentBuilder = Mutable<ConsolidatedSegment>;

/** True when `inner`'s source span lies inside `outer`'s span (typical ESTree layout). */
function nodeContainedIn(inner: AstNode, outer: AstNode): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

/**
 * Pick segment module extension from whether the segment body contains JSX and the source file extension.
 */
function extensionFromSegmentJsx(hasJsx: boolean, sourceExt: string): string {
  if (hasJsx) return '.tsx';
  if (sourceExt === '.ts') return '.ts';
  return '.js';
}

/**
 * `ContextStack` restricted to the push/peek/read methods the enter handler
 * uses. The `.pop()` method is intentionally absent — calling it from enter
 * would corrupt the context-stack-vs-pushedNodes pairing. Backed by the
 * same `ContextStack` instance the exit handler sees as the full type via
 * `ExtractWalkExitContext.naming`.
 */
type ContextStackForEnter = Pick<
  ContextStack,
  'push' | 'pushDefaultExport' | 'getDisplayName' | 'getSymbolName' | 'peek'
>;

/**
 * Enter-phase context for the extraction walker. Holds the read-only
 * inputs the walker reads, the mutable buffers it writes
 * during enter, and a `naming` field narrowed to push-only operations on
 * the `ContextStack`. The `activeSegmentBodies` field is `readonly` at the
 * array level so enter can read the top frame + mutate per-frame fields
 * (`hasJsx`, `bodyIds`) but can't pop the stack — popping is exit-only.
 */
interface ExtractWalkEnterContext {
  readonly source: string;
  readonly relPath: string;
  readonly scope: string | undefined;
  readonly transpileJsx: boolean | undefined;
  /**
   * Explicit user-set value of `transpileJsx`; defaults to false. Distinct
   * from the derived `transpileJsx` parameter above which defaults to TRUE
   * for `.tsx`/`.jsx` files when the user omits the flag. The ctxKind
   * classifier needs the strict semantic to mirror SWC's two paths.
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
   * Local names that resolve to a Qwik JSX-runtime function (`jsx` / `jsxs`
   * / `jsxDEV` from `@qwik.dev/core` or anything imported from
   * `@qwik.dev/core/jsx-runtime` / `@qwik.dev/core/jsx-dev-runtime`).
   * Mirrors SWC's `handle_jsx` callee detection. Used to push naming
   * context for peer-tool `jsx('tag', { onProp$: ... })` calls the same
   * way JSX syntax already does for `<tag onProp$=...>`.
   */
  readonly jsxFunctions: ReadonlySet<string>;
  /**
   * Tagged ObjectExpressions that are the props-bag (second arg) of a
   * recognised JSX-runtime call. Tag value records the tag-kind derived
   * from the first arg — string-literal → `'html'`, identifier →
   * `'component'`. The Property handler reads this on enter to decide
   * between literal-key push and event-handler normalisation.
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
 * Exit-phase context for the extraction walker. Extends EnterContext with
 * the two exit-only act-helpers and widens `naming` back to the full
 * `ContextStack` so the helpers can call `.pop()`. Calling either
 * `finaliseTopFrameIfMatches` or `popContextStackForNode` from the enter
 * handler is a compile error because the enter context type has no such
 * field.
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
   * The WIP segment under construction. Mutated during the walker's
   * `leave` handler (JSX-detection extension flip, segmentImports
   * finalisation). Once the walker completes, the builder is exposed as
   * the readonly `ExtractedSegment` variant at the function boundary.
   */
  result: ExtractedSegmentBuilder;
  hasJsx: boolean;
  /**
   * When set, the outer extraction walk accumulates referenced Identifier
   * names here as it descends into the body. On `leave`, the populated
   * `segmentImports` is computed from this set instead of re-walking the
   * body sub-tree — avoids an O(extractionCount × programSize) cost on
   * files with many segments.
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
 * When a marker call's single argument is an `Identifier` resolving to an
 * import binding, segments derive their displayName + hash from the
 * import path rather than the surrounding context stack — so e.g.
 * `useStyles$(css3)` with `import css3 from './style.css'` produces
 * `style_css` / hash of `./style.css#default` instead of
 * `App_component_useStyles_1` / counter-based name. This makes the segment
 * name stable across files importing the same asset under the same name.
 *
 * Mirrors SWC's `get_import_qrl_name` (transform.rs:443-478) +
 * `create_import_display_name` (transform.rs:5260-5267). Returns null for
 * non-Identifier args or Identifiers that don't resolve to an import;
 * callers fall back to the default stack-based naming.
 *
 * Scope intentionally narrow: single-Identifier case only. The
 * namespace-member-import variant (`useStyles$(ns.foo)`) from SWC's
 * second arm is currently unsupported — extend when a fixture exercises it.
 */
function getImportArgNaming(
  arg: AstNode,
  imports: Map<string, ImportInfo>,
  relPath: string,
): { importContextPortion: string; hashSeed: string } | null {
  if (arg.type !== 'Identifier') return null;
  const importInfo = imports.get(arg.name);
  if (!importInfo) return null;

  // SWC's `resolve_import_hash_path` (transform.rs:481-504) normalises
  // backslashes to forward slashes; resolves `./` and `..` against the
  // current file's directory; absolute / bare specifiers pass through.
  // The hash seed (and the path-tail extraction below) uses the
  // resolved path. Without this, `./style.css` would hash differently
  // from `style.css` even though both name the same module after
  // resolution — and SWC uses the resolved form.
  const resolvedSource = resolveImportHashPath(importInfo.source, relPath);

  // create_import_display_name (transform.rs:506-514):
  //   path_tail = source.rsplit('/').next().unwrap_or(source)
  //   base_name = escape_sym(path_tail)
  //   if import_name == "default" { base_name } else { base_name + "_" + escape_sym(import_name) }
  // Default imports have `importedName === 'default'` in our ImportInfo model.
  const slashIdx = resolvedSource.lastIndexOf('/');
  const pathTail = slashIdx >= 0 ? resolvedSource.slice(slashIdx + 1) : resolvedSource;
  const baseName = escapeSymbol(pathTail);
  const importContextPortion = importInfo.importedName === 'default'
    ? baseName
    : `${baseName}_${escapeSymbol(importInfo.importedName)}`;

  // SWC's hash_seed: `"<resolved_source>#<import_name>"` (transform.rs:477).
  const hashSeed = `${resolvedSource}#${importInfo.importedName}`;

  return { importContextPortion, hashSeed };
}

/**
 * Mirror of SWC's `resolve_import_hash_path` (transform.rs:481-504).
 * Absolute / bare specifiers pass through; relative paths resolve
 * against the directory of `relPath`.
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
 * Filter file-level imports down to those referenced by the given identifier
 * set. Hot path (function bodies pushed onto `activeSegmentBodies`) feeds in
 * the Set accumulated during the outer extraction walk — no extra walk. Cold
 * path falls back to `collectSegmentImports` which still re-walks the body
 * sub-tree.
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

/** Return the subset of file-level imports referenced by identifiers in `bodyNode`. */
function collectSegmentImports(bodyNode: AstNode, imports: Map<string, ImportInfo>): ImportInfo[] {
  return filterImportsByIds(collectIdentifiers(bodyNode), imports);
}

/** Check whether a JSX tag name represents a component (starts with uppercase). */
function isComponentTag(tagNode: JSXElementName | null | undefined): boolean {
  if (tagNode?.type === 'JSXIdentifier') {
    const ch = tagNode.name[0];
    return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
  }
  // Member expressions like Foo.Bar are always components
  return tagNode?.type === 'JSXMemberExpression';
}

/**
 * Extract all segments from a Qwik source file.
 *
 * Parses the source, walks the AST to find marker calls, and returns
 * an ExtractionResult for each one containing all info needed for
 * segment codegen and parent module rewriting.
 */
export function extractSegments(
  source: string,
  relPath: string,
  scope?: string,
  transpileJsx?: boolean,
  preParsedProgram?: AstProgram,
  /** When `preParsedProgram` is set, optional module metadata from the same parse. */
  preParsedModule?: AstEcmaScriptModule,
  /**
   * Optional out-map. When provided, populated with the closure AST node
   * (`ArrowFunctionExpression` | `FunctionExpression`) for each extraction whose body is a function,
   * keyed by the post-disambiguation `symbolName`. Lets callers skip a redundant per-extraction body re-parse.
   */
  closureNodesOut?: Map<string, AstFunction>,
  /**
   * SWC's `transpile_jsx` flag value as the **user explicitly set it**
   * (defaults to false). Distinct from the derived `transpileJsx`
   * parameter above which defaults to TRUE for `.tsx`/`.jsx` files when
   * the user omits the flag (TS's "auto-transpile" convention). The
   * ctxKind classifier needs the strict semantic to mirror SWC's
   * `parse.rs:259` gate on `transpile_jsx && is_jsx` — that gate selects
   * between the name-prefix `handle_jsx_value` classifier (default) and
   * the element-kind `handle_jsx` classifier (active).
   */
  explicitTranspileJsx?: boolean,
): readonly ExtractedSegment[] {
  const parseResult: AstParseResult | null = preParsedProgram
    ? null
    : parseWithRawTransfer(relPath, source);
  const program = preParsedProgram ?? parseResult!.program;

  const imports = collectImports(
    program,
    preParsedProgram ? preParsedModule : parseResult?.module,
  );
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

  walkWithProtocol(program, enterCtx, exitCtx, {
    enter(node: AstNode, parent: AstParentNode, ctx) {
      if (parent) ctx.parentMap.set(node, parent);

      // Accumulate Identifier names into each active body's deferred set
      // so `segmentImports` can be computed on leave without a separate
      // per-extraction body-walk — costs O(activeStack.length) per
      // Identifier (typically 1–2).
      //
      // Gate on `nodeContainedIn(node, seg.root)` so the surrounding
      // marker call's callee (`$`, `client$`, `useTask$`, …) doesn't leak
      // into the segment's bodyIds — the segment's body is `seg.root`
      // (the function argument), not the enclosing CallExpression.
      // Without the gate, extracted segments would emit a spurious
      // `import { $ } from "@qwik.dev/core"` (or `client$` / `useTask$`)
      // for the marker that wrapped them. Mirrors the same
      // `nodeContainedIn` predicate used for the JSX-detection arm below.
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
        // When the surrounding ObjectExpression was tagged as a peer-tool
        // JSX props bag (see the JSX-runtime CallExpression arm below),
        // apply the same naming rules JSX syntax already uses for
        // `<tag onProp$=...>` — `q_e_<event>` for HTML tags, `<key
        // without $>` for components. Mirrors SWC's `handle_jsx_value`
        // (transform.rs:1240), which shares the `ctx_name` path between
        // JSX syntax and peer-tool jsx() calls.
        const jsxKind = parent?.type === 'ObjectExpression'
          ? ctx.jsxPropObjects.get(parent)
          : undefined;
        const rawKey = node.key.name;
        // SWC skips `children` when building the context stack for a JSX
        // props bag (transform.rs:2358 — `if !is_children { push }`), so a
        // handler nested under `{ children: _jsxDEV("button", …) }` is named
        // `…_main_button_…`, not `…_main_children_button_…`. Only applies to
        // tagged JSX bags — a plain object literal's `children` key still
        // contributes to naming as before.
        if (!(jsxKind && rawKey === 'children')) {
          let pushedKey: string;
          if (jsxKind && rawKey.endsWith('$')) {
            if (jsxKind === 'component') {
              pushedKey = rawKey.slice(0, -1);
            } else {
              // HTML tag — match the JSX-attribute event-handler branch.
              // Passive directives aren't a JSX-prop-bag concept (no
              // `passive:click$` shorthand inside props objects), so pass
              // an empty Set; `transformEventPropName` falls back to
              // raw-name push when the prop isn't event-shaped.
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
          ctx.naming.push(calleeName.slice(0, -1)); // "useMemo$" -> "useMemo"
          pushCount++;
        } else if (
          // Peer-tool `jsx('tag', { onProp$: ... })` calls. SWC's
          // `handle_jsx` (transform.rs:1163-1188) pushes the tag from
          // arg[0] onto `stack_ctxt` before descending into the props
          // bag, so any $() segment inside the bag inherits the tag in
          // its displayName. Matches the existing `JSXElement` branch
          // below, applied here for the peer-tool form (qwik-react
          // codegen, hand-crafted `jsx('form', { onSubmit$: $() })`).
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
            // Member-expression or other non-pushable tag (e.g. `jsx(M.N, ...)`)
            // mirrors SWC's third arm at transform.rs:1184-1187 — no push, but
            // we still tag the props bag so child Property keys land via the
            // component-style rule (strip `$`) rather than the literal push.
            if (tagPush) {
              ctx.naming.push(tagPush);
              pushCount++;
            }
            if (tagKind) {
              ctx.jsxPropObjects.set(propsArg, tagKind);
            } else {
              // Default unknown tag kind to component-style stripping —
              // matches SWC's component-arm behaviour for non-literal-string
              // tag expressions.
              ctx.jsxPropObjects.set(propsArg, 'component');
            }
          }
        }
      }

      // JSXElement: push tag name from the opening element.
      // We push on JSXElement (not JSXOpeningElement) so the tag name stays
      // on the context stack for all JSXElement children, including nested
      // JSXElements and JSXAttributes. JSXOpeningElement is a sibling of
      // children in the AST, so pushing there would pop before children.
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

      // SWC's jsx plugin converts <> to jsx(Fragment, ...) before the optimizer,
      // so Fragment only enters naming context when transpileJsx is active.
      if (node.type === 'JSXFragment' && transpileJsx) {
        ctx.naming.push('Fragment');
        pushCount++;
      }

      if (node.type === 'JSXAttribute') {
        let rawAttrName: string | null = null;
        if (node.name?.type === 'JSXIdentifier') {
          rawAttrName = node.name.name;
        } else if (node.name?.type === 'JSXNamespacedName') {
          rawAttrName = `${node.name.namespace?.name ?? ''}:${node.name.name?.name ?? ''}`;
        }

        if (rawAttrName) {
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

          // Split symbol name into display portion and hash portion. The
          // 8+-alphanumeric gate here matches `HASH_SHAPE` in `types/brands.ts`,
          // so the parsed `lastPart` is always a valid `Hash`.
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
          const inlinedCanonicalFilename = mkCanonicalFilename(
            inlinedDisplayName + '_' + inlinedHash,
          );

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

          // Initial value; if `arg0` is a function whose body contains JSX,
          // the leave-handler flips this via `extensionFromSegmentJsx`.
          // Static-value `arg0` (string, identifier, null) bypasses the push
          // below — extension stays as `sourceExt`, which matches the
          // snapshot baseline.
          const extension = sourceExt;

          const extraction: ExtractedSegmentBuilder = {
            phase: 'extracted',
            symbolName: mkSymbolName(nameValue),
            displayName: inlinedDisplayName,
            hash: inlinedHash,
            canonicalFilename: inlinedCanonicalFilename,
            callStart: mkByteOffset(node.start),
            callEnd: mkByteOffset(node.end),
            calleeStart: mkByteOffset(node.callee.start),
            calleeEnd: mkByteOffset(node.callee.end),
            argStart: mkByteOffset(arg0.start),
            argEnd: mkByteOffset(arg0.end),
            bodyText: mkBodyText(bodyText),
            calleeName,
            isBare: false,
            isSync: false,
            qrlCallee: '',
            importSource: imports.get(calleeName)?.source ?? '@qwik.dev/core',
            ctxKind: 'function',
            ctxName: mkCtxName(inlinedCtxName),
            origin: mkOrigin(relPath),
            extension,
            loc: [mkByteOffset(arg0.start), mkByteOffset(arg0.end)],
            parent: null,
            captures: inlinedCaptureNames.length > 0,
            captureNames: inlinedCaptureNames,
            paramNames: [],
            // Function arg0 defers segmentImports collection into the
            // outer walk via activeSegmentBodies. Non-function arg0 (rare
            // — peer-tool cold path) falls back to the inline sub-walk.
            segmentImports:
              arg0.type === 'ArrowFunctionExpression' || arg0.type === 'FunctionExpression'
                ? []
                : collectSegmentImports(arg0, ctx.imports),
            isInlinedQrl: true,
            explicitCaptures: explicitCapturesText,
            inlinedQrlNameArg: nameValue,
            isComponentEvent: false,
            isJsxObjectProp: false,
          };
          ctx.results.push(extraction);
          if (
            arg0.type === 'ArrowFunctionExpression' ||
            arg0.type === 'FunctionExpression'
          ) {
            // Same JSX-detection treatment as marker calls and
            // JSX-attribute extractions: if any JSX node is encountered
            // while walking arg0's body, the leave-handler flips the
            // extension via extensionFromSegmentJsx. Defensive against
            // peer codegen tools that might emit raw JSX inside an
            // inlinedQrl arrow body (current peer tools — qwik-react etc.
            // — pre-transform JSX, so no current snapshot exercises this
            // path, but the gate must be ready for tools that don't).
            ctx.pushActiveSegmentBody({
              leaveNode: node,
              root: arg0,
              result: extraction,
              hasJsx: false,
              bodyIds: new Set<string>(),
            });
            ctx.pendingClosures.push({ extraction, node: arg0 });
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

        // SWC skips pushing the callee for bare $() — only wrapper context + counter matter
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
            let jsxAttrName: string | null = null;
            if (jsxAttrParent.name?.type === 'JSXIdentifier') {
              jsxAttrName = jsxAttrParent.name.name;
            } else if (jsxAttrParent.name?.type === 'JSXNamespacedName') {
              jsxAttrName = `${jsxAttrParent.name.namespace?.name ?? ''}:${jsxAttrParent.name.name?.name ?? ''}`;
            }
            if (jsxAttrName?.endsWith('$')) {
              attrCtx = ctx.naming.peek(1) ?? jsxAttrName;

              // ctxKind classification matches SWC's two paths (see
              // `swc-reference-only/transform.rs:1240+` and `:2427`).
              // Whether SWC takes the element-kind or name-prefix path
              // depends on `transpileJsx` — when true, `react::react`
              // pre-transforms JSX to `jsx()` calls (parse.rs:259) so
              // `handle_jsx`'s `is_fn` (element-kind) classifier fires;
              // when false, raw JSXAttr stays and `handle_jsx_value`'s
              // `jsx_event_to_html_attribute` (name-prefix) classifier
              // fires. TS extract.ts always sees raw JSX so the gate is
              // explicit here.
              const jsxOpeningElement = parentMap.get(jsxAttrParent);
              const isComponentElement = jsxOpeningElement?.type === 'JSXOpeningElement'
                && isComponentTag(jsxOpeningElement.name);

              if (ctx.explicitTranspileJsx) {
                // Element-kind rule (matches handle_jsx is_fn split):
                // HTML → eventHandler; Component → jSXProp.
                if (isComponentElement) {
                  isEventAttr = false;
                  isJsxNonEventAttr = true;
                } else {
                  isEventAttr = true;
                  isJsxNonEventAttr = false;
                }
              } else {
                // Name-prefix rule (matches handle_jsx_value): `on*$`
                // (incl. `document:on*$`/`window:on*$`) → eventHandler;
                // anything else → jSXProp.
                const isOnEventAttr = /^(?:document:|window:)?on[A-Z-]/.test(jsxAttrName);
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

        // When the marker's first arg is a single Identifier resolving
        // to an import binding, derive the displayName + hash from the
        // import path so the segment name stays stable across files
        // importing the same asset. Mirrors SWC's `get_import_qrl_name`
        // + `register_context_name` `hash_override` path. Falls back to
        // the default stack-based naming when the helper returns null.
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
          const lastUnder = symbolName.lastIndexOf('_');
          hash = mkHash(lastUnder >= 0 ? symbolName.slice(lastUnder + 1) : symbolName);
        }

        const extraction: ExtractedSegmentBuilder = {
          phase: 'extracted',
          symbolName,
          displayName,
          hash,
          canonicalFilename: mkCanonicalFilename(displayName + '_' + hash),
          callStart: mkByteOffset(node.start),
          callEnd: mkByteOffset(node.end),
          calleeStart: mkByteOffset(node.callee.start),
          calleeEnd: mkByteOffset(node.callee.end),
          argStart: mkByteOffset(arg.start),
          argEnd: mkByteOffset(arg.end),
          bodyText: mkBodyText(bodyText),
          calleeName: canonicalCallee,
          isBare,
          isSync,
          qrlCallee,
          importSource: imports.get(calleeName)?.source ?? '',
          ctxKind,
          ctxName,
          origin: mkOrigin(relPath),
          extension: defaultExtension,
          // `loc` carries byte offsets, not line/col — per OPTIMIZER.md's
          // documented `[byteStart, byteEnd]` contract that snap fixtures
          // also encode. Branding `ByteOffset` makes the contract explicit
          // at the type level.
          loc: [mkByteOffset(arg.start), mkByteOffset(arg.end)],
          parent: null,
          captures: false,
          captureNames: [],
          paramNames: [],
          // Deferred; populated on leave from activeSegmentBodies.bodyIds.
          segmentImports: [],
          isInlinedQrl: false,
          explicitCaptures: null,
          inlinedQrlNameArg: null,
          isComponentEvent: false,
          isJsxObjectProp: false,
        };
        ctx.results.push(extraction);
        ctx.pushActiveSegmentBody({ leaveNode: node, root: arg, result: extraction, hasJsx: false, bodyIds: new Set<string>() });
        if (
          arg.type === 'ArrowFunctionExpression' ||
          arg.type === 'FunctionExpression'
        ) {
          ctx.pendingClosures.push({ extraction, node: arg });
        }
      }

      // JSX $-suffixed attribute extraction (e.g., onClick$={expr})
      let jsxAttrName: string | null = null;
      if (
        node.type === 'JSXAttribute' &&
        node.value?.type === 'JSXExpressionContainer' &&
        node.value.expression
      ) {
        if (node.name?.type === 'JSXIdentifier' && node.name.name.endsWith('$')) {
          jsxAttrName = node.name.name;
        } else if (node.name?.type === 'JSXNamespacedName') {
          const full = `${node.name.namespace?.name ?? ''}:${node.name.name?.name ?? ''}`;
          if (full.endsWith('$')) {
            jsxAttrName = full;
          }
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

          // Same two-rule classification as the marker-call JSXAttr path
          // above. transpileJsx=true uses element-kind rule (Component →
          // jSXProp); transpileJsx=false uses name-prefix rule (`on*$` →
          // eventHandler regardless of element kind).
          const isOnEventAttr = /^(?:document:|window:)?on[A-Z-]/.test(attrName);
          let ctxKind: 'function' | 'eventHandler' | 'jSXProp';
          if (explicitTranspileJsx === true) {
            ctxKind = isComponentEvent ? 'jSXProp' : 'eventHandler';
          } else {
            ctxKind = isComponentEvent && !isOnEventAttr ? 'jSXProp' : 'eventHandler';
          }
          const ctxName = mkCtxName(attrName);

          const displayName = ctx.naming.getDisplayName();
          const symbolName = ctx.naming.getSymbolName();

          const lastUnder = symbolName.lastIndexOf('_');
          const hash = mkHash(lastUnder >= 0 ? symbolName.slice(lastUnder + 1) : symbolName);

          const extraction: ExtractedSegmentBuilder = {
            phase: 'extracted',
            symbolName,
            displayName,
            hash,
            canonicalFilename: mkCanonicalFilename(displayName + '_' + hash),
            callStart: mkByteOffset(node.start),
            callEnd: mkByteOffset(node.end),
            calleeStart: mkByteOffset(node.name.start),
            calleeEnd: mkByteOffset(node.name.end),
            argStart: mkByteOffset(expr.start),
            argEnd: mkByteOffset(expr.end),
            bodyText: mkBodyText(bodyText),
            calleeName: attrName,
            isBare: false,
            isSync: false,
            qrlCallee: '',
            importSource: '',
            ctxKind,
            ctxName,
            origin: mkOrigin(relPath),
            extension: defaultExtension,
            // `loc` carries byte offsets matching OPTIMIZER.md's documented
            // contract — same as the marker-call extraction path above.
            loc: [mkByteOffset(expr.start), mkByteOffset(expr.end)],
            parent: null,
            captures: false,
            captureNames: [],
            paramNames: [],
            // Deferred; populated on leave from activeSegmentBodies.bodyIds.
            segmentImports: [],
            isInlinedQrl: false,
            explicitCaptures: null,
            inlinedQrlNameArg: null,
            isComponentEvent,
            isJsxObjectProp: false,
          };
          ctx.results.push(extraction);
          ctx.pushActiveSegmentBody({ leaveNode: node, root: expr, result: extraction, hasJsx: false, bodyIds: new Set<string>() });
          // The enclosing if-block already gates on `expr.type` being a function expression,
          // so the cast here is safe.
          ctx.pendingClosures.push({ extraction, node: expr as AstFunction });
        }
      }

      // Pre-transformed JSX: a `$`-suffixed handler in a JSX-factory call's
      // props bag (`_jsxDEV("button", { onClick$: () => … })`). esbuild
      // transpiles `.tsx` to `_jsxDEV(...)` before the optimizer runs in the
      // bundler pipeline, so these handlers arrive as object properties, not
      // JSX attributes. Without this branch they stay inline in the parent
      // body — never lazy-loaded, and any module-level binding they reference
      // (e.g. `const testServer$ = server$(…)`) gets mis-attributed and
      // dropped. SWC extracts them into their own segment exactly like a JSX
      // attribute (`handle_jsx_value` shares the `ctx_name` path); we mirror
      // that. The marker-call form (`onClick$: $(() => …)`) is already caught
      // by the CallExpression walker above, so this only handles bare
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

          // Same two-rule classification as the JSX-attribute path above.
          const isOnEventAttr = /^(?:document:|window:)?on[A-Z-]/.test(propKey);
          let ctxKind: 'function' | 'eventHandler' | 'jSXProp';
          if (explicitTranspileJsx === true) {
            ctxKind = isComponentEvent ? 'jSXProp' : 'eventHandler';
          } else {
            ctxKind = isComponentEvent && !isOnEventAttr ? 'jSXProp' : 'eventHandler';
          }
          const ctxName = mkCtxName(propKey);

          // The prop key was already pushed onto the naming stack by the
          // `Property` naming branch above (`q_e_click` for HTML events), so
          // these reflect the full call-site context.
          const displayName = ctx.naming.getDisplayName();
          const symbolName = ctx.naming.getSymbolName();

          const lastUnder = symbolName.lastIndexOf('_');
          const hash = mkHash(lastUnder >= 0 ? symbolName.slice(lastUnder + 1) : symbolName);

          const extraction: ExtractedSegmentBuilder = {
            phase: 'extracted',
            symbolName,
            displayName,
            hash,
            canonicalFilename: mkCanonicalFilename(displayName + '_' + hash),
            // Call site is the bare value — replacing `[callStart, callEnd]`
            // with the QRL ref leaves `onClick$: q_<symbol>`, which Phase 5b's
            // `_jsxDEV`→`_jsxSorted` rewrite then renames + slices.
            callStart: mkByteOffset(value.start),
            callEnd: mkByteOffset(value.end),
            calleeStart: mkByteOffset(node.key.start),
            calleeEnd: mkByteOffset(node.key.end),
            argStart: mkByteOffset(value.start),
            argEnd: mkByteOffset(value.end),
            bodyText: mkBodyText(bodyText),
            calleeName: propKey,
            isBare: false,
            isSync: false,
            qrlCallee: '',
            importSource: '',
            ctxKind,
            ctxName,
            origin: mkOrigin(relPath),
            extension: defaultExtension,
            loc: [mkByteOffset(value.start), mkByteOffset(value.end)],
            parent: null,
            captures: false,
            captureNames: [],
            paramNames: [],
            segmentImports: [],
            isInlinedQrl: false,
            explicitCaptures: null,
            inlinedQrlNameArg: null,
            isComponentEvent,
            isJsxObjectProp: true,
          };
          ctx.results.push(extraction);
          ctx.pushActiveSegmentBody({ leaveNode: node, root: value, result: extraction, hasJsx: false, bodyIds: new Set<string>() });
          ctx.pendingClosures.push({ extraction, node: value as AstFunction });
        }
      }

      if (pushCount > 0) ctx.pushedNodes.set(node, pushCount);
    },

    leave(node: AstNode, _parent, ctx) {
      ctx.finaliseTopFrameIfMatches(node);
      ctx.popContextStackForNode(node);
    },
  });

  // Pass `fileName` (e.g. "index.tsx") — that's what `buildDisplayName`
  // prepends as the strip-prefix. `fileStem` may differ from the filename
  // for routing files (e.g. `routes/foo/index.tsx` → fileStem "foo"), in
  // which case the prefix-strip silently no-ops and the contextPortion
  // ends up with `.tsx` literally embedded — mkSymbolName then rejects it.
  disambiguateExtractions(results, fileName, relPath, scope);

  if (closureNodesOut) {
    for (const { extraction, node } of pendingClosures) {
      closureNodesOut.set(extraction.symbolName, node);
    }
  }

  return results;
}

/**
 * Append _1, _2, etc. suffixes to extractions that share a display name,
 * recomputing hashes accordingly. Mirrors Rust's `register_context_name`.
 */
function disambiguateExtractions(
  extractions: ExtractedSegmentBuilder[],
  fileStem: string,
  relPath: string,
  scope?: string,
): void {
  // Mutates identity fields on entries that collide on `displayName`'s
  // context portion. The builder type's mutability is the FFI-boundary
  // concession; `extractSegments` exposes the array as
  // `readonly ExtractedSegment[]` at its return statement.
  const nameCounters = new Map<string, number>();
  const prefix = fileStem + '_';

  for (const ext of extractions) {
    // Peer-tool `inlinedQrl(body, "name", [...])` extractions carry an
    // explicit name set by the upstream tool (qwik-react codegen,
    // already-optimised input, etc.). Those names are unique by
    // construction — appending `_<n>` would rewrite a name the consumer
    // already expects and that the prod-rename hash math (`s_<hash>`) is
    // computed against verbatim. Skip them.
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
