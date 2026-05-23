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
import { qwikHash } from '../hashing/siphash.js';
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
import { getBasename, getDirectory, getExtension, getFileStem } from './path-utils.js';
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
  // than mutating the consolidated extraction (OSS-389).
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
}

/**
 * Phase-spanning fields. Present on all variants; mutable for the
 * pipeline's in-place transition pattern (Phase 1 → 3 capture analysis,
 * Phase 5 parent rewrite, event-capture promotion all mutate in place).
 * The discriminator `phase` narrows the union at consumer sites.
 *
 * See OSS-389's "pragmatic pivot": union types + discriminator ship now;
 * per-field readonly enforcement on phase-spanning fields is the natural
 * follow-up once consumer sites have been narrowed to specific variants
 * and the construct-new pattern is applied at each phase boundary.
 * Truly-immutable fields (identity, position, body text, ctx, etc.) stay
 * readonly on `ExtractionBase` — OSS-387's discipline is preserved there.
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
 * on `phase` to access phase-specific fields safely. See OSS-389.
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
 * would corrupt the context-stack-vs-pushedNodes pairing (OSS-397, Phase 2b
 * of OSS-391). Backed by the same `ContextStack` instance the exit handler
 * sees as the full type via `ExtractWalkExitContext.naming`.
 */
type ContextStackForEnter = Pick<
  ContextStack,
  'push' | 'pushDefaultExport' | 'getDisplayName' | 'getSymbolName' | 'peek'
>;

/**
 * Enter-phase context for the extraction walker (OSS-397). Holds the 11
 * read-only inputs the walker reads, the five mutable buffers it writes
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
  readonly sourceExt: string;
  readonly defaultExtension: string;
  readonly fileStem: string;
  readonly fileName: string;
  readonly imports: Map<string, ImportInfo>;
  readonly customInlined: Map<string, CustomInlinedInfo>;
  readonly hasNonQwikJsxImportSource: boolean;
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
   * body sub-tree. See OSS-368.
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

  // Suppress JSX $-suffixed attribute extraction when a non-Qwik @jsxImportSource is set
  const hasNonQwikJsxImportSource = /\/\*\s*@jsxImportSource\s+(?!@qwik|@builder\.io\/qwik)\S+/.test(source);

  // Per OSS-397 (OSS-391 Phase 2b): split walk state into Enter and Exit
  // context views so the type system enforces "enter pushes, leave pops."
  // Enter sees `naming` as a push-only `ContextStackForEnter`; Exit sees the
  // full `ContextStack` plus the two act-helpers. Calling
  // `ctx.naming.pop()` or `ctx.popContextStackForNode(node)` from the enter
  // handler is a compile error.
  const enterCtx: ExtractWalkEnterContext = {
    source,
    relPath,
    scope,
    transpileJsx,
    sourceExt,
    defaultExtension,
    fileStem,
    fileName,
    imports,
    customInlined,
    hasNonQwikJsxImportSource,
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
      // (OSS-368). Replaces the per-extraction `collectIdentifiers` sub-walk:
      // the outer walk is about to visit these nodes anyway, so collecting
      // here costs O(activeStack.length) per Identifier — usually 1–2.
      //
      // OSS-427: gate on `nodeContainedIn(node, seg.root)` so the surrounding
      // marker call's callee (`$`, `client$`, `useTask$`, …) doesn't leak
      // into the segment's bodyIds — the segment's body is `seg.root` (the
      // function argument), not the enclosing CallExpression. Without the
      // gate, extracted segments emit a spurious `import { $ } from
      // "@qwik.dev/core"` (or `client$` / `useTask$`) for the marker that
      // wrapped them. Mirrors the same `nodeContainedIn` predicate already
      // used for the JSX-detection arm just below.
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
        ctx.naming.push(node.key.name);
        pushCount++;
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

          // Initial value; if `arg0` is a function whose body contains JSX, the
          // leave-handler at line 701 will flip this via `extensionFromSegmentJsx`
          // (same mechanism OSS-351 introduced for marker calls and JSX attrs).
          // Static-value `arg0` (string, identifier, null) bypasses the push
          // below — extension stays as `sourceExt`, which matches the snapshot
          // baseline.
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
            // Function arg0 defers segmentImports collection into the outer
            // walk via activeSegmentBodies (OSS-368). Non-function arg0 (rare
            // — peer-tool cold path) falls back to the inline sub-walk.
            segmentImports:
              arg0.type === 'ArrowFunctionExpression' || arg0.type === 'FunctionExpression'
                ? []
                : collectSegmentImports(arg0, ctx.imports),
            isInlinedQrl: true,
            explicitCaptures: explicitCapturesText,
            inlinedQrlNameArg: nameValue,
            isComponentEvent: false,
          };
          ctx.results.push(extraction);
          if (
            arg0.type === 'ArrowFunctionExpression' ||
            arg0.type === 'FunctionExpression'
          ) {
            // Same JSX-detection treatment OSS-351 added for marker calls and
            // JSX-attribute extractions: if any JSX node is encountered while
            // walking arg0's body, the leave-handler flips the extension via
            // extensionFromSegmentJsx. Defensive against peer codegen tools
            // that might emit raw JSX inside an inlinedQrl arrow body
            // (current peer tools — qwik-react etc. — pre-transform JSX, so
            // none of the 12 inlinedQrl-using snapshots in match-these-snaps/
            // exercise this path; verified during OSS-352).
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

              // Component elements use jSXProp for ALL $-suffixed attrs;
              // HTML elements use eventHandler for on* attrs.
              const jsxOpeningElement = parentMap.get(jsxAttrParent);
              const isComponentElement = jsxOpeningElement?.type === 'JSXOpeningElement'
                && isComponentTag(jsxOpeningElement.name);

              if (isComponentElement) {
                isEventAttr = false;
                isJsxNonEventAttr = true;
              } else {
                isEventAttr = jsxAttrName.startsWith('on') || jsxAttrName.startsWith('document:on') || jsxAttrName.startsWith('window:on');
                isJsxNonEventAttr = !isEventAttr;
              }
            }
          }
        }

        const ctxKind = getExtractionKind(canonicalCallee, isEventAttr, isJsxNonEventAttr);
        const isJsxAttrContext = isEventAttr || isJsxNonEventAttr;
        const ctxName = mkCtxName(getExtractionName(canonicalCallee, isJsxAttrContext, isJsxAttrContext ? attrCtx : undefined));

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
          // OSS-386: `loc` is documented as `[byteStart, byteEnd]` in
          // OPTIMIZER.md and snap fixtures emit byte offsets; this site
          // previously emitted `[line, col]` (a pre-existing semantic
          // mismatch, hidden because convergence's strict-compare skips
          // `loc`). Branding `ByteOffset` makes the contract explicit.
          loc: [mkByteOffset(arg.start), mkByteOffset(arg.end)],
          parent: null,
          captures: false,
          captureNames: [],
          paramNames: [],
          // OSS-368 — deferred; populated on leave from activeSegmentBodies.bodyIds.
          segmentImports: [],
          isInlinedQrl: false,
          explicitCaptures: null,
          inlinedQrlNameArg: null,
          isComponentEvent: false,
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

          // HTML elements: all $-attrs -> eventHandler; components: on* -> eventHandler, rest -> jSXProp
          let ctxKind: 'function' | 'eventHandler' | 'jSXProp' = 'eventHandler';
          if (isComponentEvent) {
            const isOnEvent = attrName.startsWith('on') || attrName.startsWith('document:on') || attrName.startsWith('window:on');
            if (!isOnEvent) {
              ctxKind = 'jSXProp';
            }
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
            // OSS-386: same pre-existing semantic mismatch as site 1 — `loc` now
            // carries byte offsets matching OPTIMIZER.md's documented contract.
            loc: [mkByteOffset(expr.start), mkByteOffset(expr.end)],
            parent: null,
            captures: false,
            captureNames: [],
            paramNames: [],
            // OSS-368 — deferred; populated on leave from activeSegmentBodies.bodyIds.
            segmentImports: [],
            isInlinedQrl: false,
            explicitCaptures: null,
            inlinedQrlNameArg: null,
            isComponentEvent,
          };
          ctx.results.push(extraction);
          ctx.pushActiveSegmentBody({ leaveNode: node, root: expr, result: extraction, hasJsx: false, bodyIds: new Set<string>() });
          // The enclosing if-block already gates on `expr.type` being a function expression,
          // so the cast here is safe.
          ctx.pendingClosures.push({ extraction, node: expr as AstFunction });
        }
      }

      if (pushCount > 0) ctx.pushedNodes.set(node, pushCount);
    },

    leave(node: AstNode, _parent, ctx) {
      ctx.finaliseTopFrameIfMatches(node);
      ctx.popContextStackForNode(node);
    },
  });

  disambiguateExtractions(results, fileStem, relPath, scope);

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
    // OSS-408 Fix B: peer-tool `inlinedQrl(body, "name", [...])` extractions
    // carry an explicit name set by the upstream tool (qwik-react codegen,
    // already-optimised input, etc.). Those names are unique by construction
    // — appending `_<n>` would rewrite a name the consumer already expects
    // and that the prod-rename hash math (`s_<hash>`) is computed against
    // verbatim. Skip them.
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
