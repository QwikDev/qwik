/** @file Public APIs for the SSR */
import { isDev } from '@qwik.dev/core/build';
import {
  _SubscriptionData as SubscriptionData,
  _SharedContainer,
  _jsxSorted,
  _jsxSplit,
  _res,
  _setEvent,
  _ssrDiff as ssrDiff,
  _createQRL as createQRL,
  _addCursor as addCursor,
  _getCursorData as getCursorData,
  _processCursorQueue as processCursorQueue,
  _hasActiveCursors as hasActiveCursors,
  _VirtualVNode as VirtualVNode,
  _vnode_getProp as vnode_getProp,
  _vnode_setProp as vnode_setProp,
  isSignal,
  type Signal,
} from '@qwik.dev/core/internal';
import type { ResolvedManifest } from '@qwik.dev/core/optimizer';
import {
  ATTR_EQUALS_QUOTE,
  BRACKET_CLOSE,
  BRACKET_OPEN,
  CLOSE_TAG,
  COMMA,
  DEBUG_TYPE,
  ELEMENT_BACKPATCH_DATA,
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  ELEMENT_SEQ_IDX,
  EMPTY_ATTR,
  GT,
  ITERATION_ITEM_MULTI,
  ITERATION_ITEM_SINGLE,
  LT,
  OnRenderProp,
  PAREN_CLOSE,
  QBackRefs,
  QBaseAttr,
  QContainerAttr,
  QContainerValue,
  QCtxAttr,
  QError,
  QInstanceAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QRenderAttr,
  QRuntimeAttr,
  QScopedStyle,
  QSlot,
  QSlotParent,
  QStyle,
  QTemplate,
  QUOTE,
  QVersionAttr,
  Q_PROPS_SEPARATOR,
  SPACE,
  VNodeDataChar,
  VNodeDataSeparator,
  VirtualType,
  convertStyleIdsToString,
  dangerouslySetInnerHTML,
  encodeVNodeDataString,
  escapeHTML,
  isHtmlAttributeAnEventName,
  isObjectEmpty,
  isPreventDefault,
  isPromise,
  mapArray_get,
  mapArray_has,
  mapArray_set,
  maybeThen,
  qError,
  retryOnPromise,
  serializeAttribute,
  ChoreBits,
  VNodeFlags,
} from './qwik-copy';
import {
  type ContextId,
  type HostElement,
  type SSRContainer as ISSRContainer,
  type ISsrComponentFrame,
  type ISsrNode,
  type IStreamHandler,
  type JSXChildren,
  type JSXNodeInternal,
  type JSXOutput,
  type Props,
  type SerializationContext,
  type SignalImpl,
  type StreamWriter,
  type SymbolToChunkResolver,
  type ValueOrPromise,
} from './qwik-types';

import { preloaderPost, preloaderPre } from './preload-impl';
import { getQwikBackpatchExecutorScript, getQwikLoaderScript } from './scripts';
import {
  DomRef,
  SsrComponentFrame,
  SsrNode,
  SsrNodeKind,
  SSR_VAR_ATTRS,
  SSR_CONST_ATTRS,
  SSR_STYLE_SCOPED_ID,
  SSR_SUSPENSE_FALLBACK,
  SSR_SUSPENSE_PLACEHOLDER_ID,
  SSR_SUSPENSE_CONTENT,
  SSR_SUSPENSE_READY,
  ssrNode_addOrderedChild,
  ssrNode_setTreeNonUpdatable,
} from './ssr-node';
import { Q_FUNCS_PREFIX } from './ssr-render';
import { SsrStreamingWalker, IncrementalEmitter, EmitResult } from './ssr-streaming-walker';
import {
  TagNesting,
  allowedContent,
  initialTag,
  isSelfClosingTag,
  isTagAllowed,
} from './tag-nesting';
import {
  VNodeDataFlag,
  type BackpatchEntry,
  type RenderOptions,
  type RenderToStreamResult,
  type SSRContainerOptions,
  type SSRRenderOptions,
} from './types';
import { createTimer } from './utils';
import {
  CLOSE_FRAGMENT,
  OPEN_FRAGMENT,
  WRITE_ELEMENT_ATTRS,
  encodeAsAlphanumeric,
  vNodeData_addTextSize,
  vNodeData_closeFragment,
  vNodeData_createSsrNodeReference,
  vNodeData_incrementElementCount,
  vNodeData_openElement,
  vNodeData_openFragment,
  type VNodeData,
} from './vnode-data';

const NODE_DIFF_DATA_KEY = ':nodeDiff';

enum QwikLoaderInclude {
  Module,
  Inline,
  Done,
}

/** Tracks a Suspense boundary for OoO streaming. */
interface SuspenseBoundary {
  /** The Suspense boundary SsrNode. */
  node: ISsrNode;
  /** Unique placeholder ID for the fallback wrapper div. */
  placeholderId: string;
  /** The content SsrNode holding the rendered children (built by sub-cursor). */
  contentNode: SsrNode;
  /** When the boundary's deferred subtree work started. */
  createdAt: number;
  /** Whether the fallback placeholder was actually emitted. */
  fallbackEmitted: boolean;
}

export function ssrCreateContainer(opts: SSRRenderOptions): ISSRContainer {
  opts.renderOptions ||= {};
  return new SSRContainer({
    tagName: opts.tagName || 'div',
    writer: opts.writer || new StringBufferWriter(),
    streamHandler: opts.streamHandler,
    locale: opts.locale || '',
    timing: opts.timing || {
      firstFlush: 0,
      render: 0,
      snapshot: 0,
    },
    buildBase: opts.buildBase || '/build/',
    resolvedManifest: opts.resolvedManifest || {
      mapper: {},
      manifest: {
        manifestHash: 'dev',
        mapping: {},
      },
    },
    renderOptions: opts.renderOptions,
  });
}

class StringBufferWriter {
  private buffer = [] as string[];
  write(text: string) {
    this.buffer.push(text);
  }
  toString() {
    return this.buffer.join('');
  }
}

interface ElementFrame {
  /*
   * Used during development mode to track the nesting of HTML tags
   * in order provide error messages when the nesting is incorrect.
   */
  tagNesting: TagNesting;
  parent: ElementFrame | null;
  /** Element name. */
  elementName: string;
  /**
   * Current element index.
   *
   * This number must match the depth-first traversal of the DOM elements as returned by the
   * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  depthFirstElementIdx: number;
  vNodeData: VNodeData;
  currentFile: string | null;
  /** SsrNode associated with this element frame (set in tree-building mode). */
  ssrNode: ISsrNode | null;
}

const EMPTY_OBJ = {};

/** Per-cursor frame state for SSR tree building. */
export interface SsrBuildState {
  currentElementFrame: ElementFrame | null;
  componentStack: ISsrComponentFrame[];
  currentComponentNode: ISsrNode | null;
  /**
   * Stack of saved ssrNode values for fragment nesting in tree-building mode. When a fragment
   * opens, the current frame's ssrNode is pushed here and replaced with the fragment's SsrNode.
   * When the fragment closes, the previous value is restored.
   */
  ssrNodeStack: (ISsrNode | null)[];
}

/** Creates a fresh SsrBuildState. */
export function createSsrBuildState(): SsrBuildState {
  return {
    currentElementFrame: null,
    componentStack: [],
    currentComponentNode: null,
    ssrNodeStack: [],
  };
}

/**
 * Stores sequential sequence arrays, which in turn store Tasks which have cleanup functions which
 * need to be executed at the end of SSR.
 */
export type CleanupQueue = any[][];

const QTemplateProps = {
  hidden: true,
  'aria-hidden': true,
};

class SSRContainer extends _SharedContainer implements ISSRContainer {
  public tag: string;
  public isHtml: boolean;
  public writer: StreamWriter;
  public streamHandler: IStreamHandler;
  public timing: RenderToStreamResult['timing'];
  public size = 0;
  public resolvedManifest: ResolvedManifest;
  public symbolToChunkResolver: SymbolToChunkResolver;
  public renderOptions: RenderOptions;
  public serializationCtx: SerializationContext;
  /**
   * We use this to append additional nodes in the head node
   *
   * - From manifest injections
   * - From useStyles and useScopedStyles hooks
   */
  public additionalHeadNodes = new Array<JSXNodeInternal>();

  /**
   * We use this to append additional nodes in the body node
   *
   * - From manifest injections
   */
  public additionalBodyNodes = new Array<JSXNodeInternal>();

  public ssrBuildState: SsrBuildState = createSsrBuildState();
  /** Cached last-created SsrNode. Cleared before each new node creation. */
  private lastNode: ISsrNode | null = null;
  private styleIds = new Set<string>();
  private isBackpatchExecutorEmitted = false;
  private backpatchMap = new Map<number, BackpatchEntry[]>();
  /** In cursor-driven mode, backpatch entries keyed by SsrNode (index resolved at emission). */
  private backpatchNodeMap = new Map<ISsrNode, BackpatchEntry[]>();

  /**
   * When true, container methods write directly to the stream instead of building tree. Only set
   * during emitContainerData (script tags for state, vnodes, etc.).
   */
  private _directMode = false;

  /**
   * When true, closeElement's manual rendering path (emitContainerDataFrame check) is suppressed.
   * Set during cursor-driven render() — container data is handled by the walker callback instead.
   */
  private _cursorDrivenRender = false;

  /** Root SsrNode of the content tree (the container element). Used by the streaming walker. */
  public rootSsrNode: ISsrNode | null = null;

  private renderTimer: ReturnType<typeof createTimer>;
  /**
   * Current element index.
   *
   * This number must match the depth-first traversal of the DOM elements as returned by the
   * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  private depthFirstElementCount: number = -1;
  private vNodeDatas: VNodeData[] = [];
  private cleanupQueue: CleanupQueue = [];
  private emitContainerDataFrame: ElementFrame | null = null;
  public $instanceHash$ = randomStr();
  // Temporary flag to find missing roots after the state was serialized
  private $noMoreRoots$ = false;
  private qlInclude: QwikLoaderInclude;
  private promiseAttributes: Array<Promise<any>> | null = null;

  /** Suspense boundaries with deferred children for OoO streaming. */
  private suspenseBoundaries: SuspenseBoundary[] = [];
  /** Counter for generating unique Suspense placeholder IDs. */
  private suspensePlaceholderCounter = 0;
  /** Current Suspense boundary node being built (for storing fallback content). */
  private currentSuspenseBoundary: ISsrNode | null = null;
  /** Grace period before emitting a Suspense fallback. */
  private readonly suspenseFallbackDelay: number;

  /** Active cursor for ssrDiff calls from container methods (e.g., unclaimed projections). */
  _activeCursor: any = null;
  /** Stack for saving/restoring _currentParentVNode across nested component boundaries. */

  constructor(opts: SSRContainerOptions) {
    super(opts.renderOptions.serverData ?? EMPTY_OBJ, opts.locale);
    this.symbolToChunkResolver = (symbol: string): string => {
      const idx = symbol.lastIndexOf('_');
      const chunk = this.resolvedManifest.mapper[idx == -1 ? symbol : symbol.substring(idx + 1)];
      return chunk ? chunk[1] : '';
    };
    this.serializationCtx = this.serializationCtxFactory(
      SsrNode,
      DomRef,
      this.symbolToChunkResolver,
      opts.writer
    );
    this.renderTimer = createTimer();
    this.tag = opts.tagName;
    this.isHtml = opts.tagName === 'html';
    this.writer = opts.writer;
    this.streamHandler = opts.streamHandler;
    this.suspenseFallbackDelay = Math.max(
      0,
      opts.renderOptions.streaming?.suspenseFallbackDelay ?? 0
    );
    this.timing = opts.timing;
    this.$buildBase$ = opts.buildBase;
    this.resolvedManifest = opts.resolvedManifest;
    this.renderOptions = opts.renderOptions;
    // start from 100_000 to avoid interfering with potential existing ids
    this.$currentUniqueId$ = 100_000;

    const qlOpt = this.renderOptions.qwikLoader;
    this.qlInclude = qlOpt
      ? typeof qlOpt === 'object'
        ? qlOpt.include === 'never'
          ? QwikLoaderInclude.Done
          : QwikLoaderInclude.Module
        : qlOpt === 'inline'
          ? QwikLoaderInclude.Inline
          : qlOpt === 'never'
            ? QwikLoaderInclude.Done
            : QwikLoaderInclude.Module
      : QwikLoaderInclude.Module;
    if (this.qlInclude === QwikLoaderInclude.Module) {
      const qwikLoaderChunk = this.resolvedManifest?.manifest.qwikLoader;
      if (!qwikLoaderChunk) {
        this.qlInclude = QwikLoaderInclude.Inline;
      }
    }

    this.$processInjectionsFromManifest$();
  }

  ensureProjectionResolved(_host: HostElement): void {}

  /** Stored error from cursor walker — re-thrown in render() */
  private _ssrError: any = null;

  handleError(err: any, _$host$: HostElement | null): void {
    // Store the error so render() can re-throw it after cursor processing.
    // The cursor walker catches errors from chore execution and calls this;
    // if we throw here, async errors become unhandled rejections.
    if (!this._ssrError) {
      this._ssrError = err;
    }
  }

  addBackpatchEntry(
    ssrNodeOrId: string | ISsrNode,
    attrName: string,
    serializedValue: string | boolean | null
  ): void {
    const entry: BackpatchEntry = {
      attrName,
      value: serializedValue,
    };
    if (typeof ssrNodeOrId === 'string') {
      // Direct streaming mode: element index is already final
      const elementIndex = parseInt(ssrNodeOrId, 10);
      const entries = this.backpatchMap.get(elementIndex) || [];
      entries.push(entry);
      this.backpatchMap.set(elementIndex, entries);
    } else {
      // Cursor-driven mode: defer index resolution until emission
      const entries = this.backpatchNodeMap.get(ssrNodeOrId) || [];
      entries.push(entry);
      this.backpatchNodeMap.set(ssrNodeOrId, entries);
    }
  }

  async render(jsx: JSXOutput) {
    // Phase 1: Open container element (builds root SsrNode in tree-building mode)
    this.openContainer();

    // Prevent closeElement from triggering the manual rendering path during cursor-driven
    // rendering. render() handles container data emission via the emitter callback instead.
    this._cursorDrivenRender = true;

    // Phase 2: Set up cursor-driven rendering and incremental emission.
    const rootSsrNode = this.getOrCreateLastNode();
    this.ssrBuildState.currentElementFrame!.ssrNode = rootSsrNode;
    this.rootSsrNode = rootSsrNode;

    // Create a cursor root VNode to drive SSR rendering through the cursor walker.
    // Store the JSX in :nodeDiff so executeSsrNodeDiff processes it via ssrDiff.
    const cursorRoot = new VirtualVNode(
      null, // key
      VNodeFlags.Virtual,
      null, // parent
      null, // previousSibling
      null, // nextSibling
      { [NODE_DIFF_DATA_KEY]: jsx },
      null, // firstChild
      null // lastChild
    );
    cursorRoot.dirty = ChoreBits.NODE_DIFF;

    const cursor = addCursor(this, cursorRoot, 0);
    const mainCursorData = getCursorData(cursor)!;
    // Wire up the SsrBuildState so the cursor walker swaps it when processing this cursor
    mainCursorData.ssrBuildState = this.ssrBuildState;

    // Phase 3: Interleaving loop — cursor builds tree, emitter emits ready nodes.
    // On each iteration: process all sync cursor work, then emit whatever is ready.
    // If blocked on a dirty node, wait for async cursor completion and retry.
    // Currently, with inline component execution, the tree is fully built in the
    // first cursor pass. The infrastructure supports future deferred execution.

    // Save the main build state — processCursorQueue may swap ssrBuildState to a sub-cursor's
    // context (e.g., Suspense children). We need to restore it for the emission phase.
    const mainBuildState = this.ssrBuildState;

    // Suspense boundaries always use OoO streaming, regardless of whether their sub-cursor
    // completed synchronously. Boundaries that are ready by emission time are inlined instead.
    const deferredBoundaries = this.suspenseBoundaries;
    const deferredBoundaryMap = new Map(deferredBoundaries.map((b) => [b.node, b] as const));

    // Reset vNodeDatas and element counter — emitter will rebuild in document order
    this.vNodeDatas = [];
    this.depthFirstElementCount = -1;

    // Initialize emitter — containerDataNode is set after the first processCursorQueue
    // because the body SsrNode doesn't exist until the cursor builds the tree.
    const emitter = new IncrementalEmitter(
      this.writer,
      rootSsrNode, // placeholder — updated below after tree building
      deferredBoundaryMap,
      this.suspenseFallbackDelay,
      (node) => this.markSuspenseFallbackEmitted(node),
      this.vNodeDatas
    );
    emitter.init(rootSsrNode);

    // Emission loop: emit ready nodes, handle callbacks, retry if blocked
    let emitDone = false;
    let savedContainerDataFrame: typeof this.emitContainerDataFrame = null;
    const yieldBudget = this.renderOptions.streaming?.yieldBudget ?? 10;
    const yieldToIO =
      yieldBudget > 0
        ? () =>
            new Promise<void>((r) =>
              typeof setImmediate !== 'undefined' ? setImmediate(r) : setTimeout(r, 0)
            )
        : null;
    while (!emitDone) {
      processCursorQueue({ timeBudget: yieldBudget });

      // After the first processCursorQueue, capture the container data frame.
      // emitContainerDataFrame is set during tree building when openElement encounters <body>.
      if (!savedContainerDataFrame && this.emitContainerDataFrame) {
        savedContainerDataFrame = this.emitContainerDataFrame;
        this.emitContainerDataFrame = null;
        // Update emitter's containerDataNode to the body SsrNode
        const bodyNode = this.isHtml ? savedContainerDataFrame.ssrNode : null;
        if (bodyNode) {
          emitter.containerDataNode = bodyNode;
        }
      }
      emitter.syncSuspenseBoundaries(this.suspenseBoundaries);
      // Restore main build state — sub-cursor walk may have swapped it
      this.ssrBuildState = mainBuildState;
      if (this._ssrError) {
        throw this._ssrError;
      }

      const result = emitter.emitReady();

      switch (result) {
        case EmitResult.COMPLETE:
          emitDone = true;
          break;

        case EmitResult.NEEDS_CALLBACK: {
          // Container data point reached — emit container data before close tag
          const currentFrame = this.ssrBuildState.currentElementFrame;
          if (savedContainerDataFrame) {
            this.ssrBuildState.currentElementFrame = savedContainerDataFrame;
          }
          this.onRenderDone();
          const snapshotTimer = createTimer();

          // Wait for any remaining async sub-cursors (Suspense children)
          if (this.$renderPromise$) {
            await this.$renderPromise$;
            // Sub-cursor processing may have changed ssrBuildState during its execution
            this.ssrBuildState = mainBuildState;
          }

          // Emit OoO chunks for deferred boundaries (now resolved)
          const emittedFallbackBoundaries = deferredBoundaries.filter((b) => b.fallbackEmitted);
          if (emittedFallbackBoundaries.length > 0) {
            this.emitOoOChunks(emittedFallbackBoundaries);
          }

          this._directMode = true;
          await this.emitContainerData();
          this._directMode = false;
          this.timing.snapshot = snapshotTimer();
          this.ssrBuildState.currentElementFrame = currentFrame;
          // Continue emission after callback
          break;
        }

        case EmitResult.BLOCKED_DIRTY:
          if (hasActiveCursors() && yieldToIO) {
            // Time budget expired with sync work remaining.
            // Flush buffered output so the client gets data, then yield to I/O.
            this.streamHandler?.flush();
            await yieldToIO();
            this.ssrBuildState = mainBuildState;
            break;
          }
          // Wait for cursor work to complete. Cursor async chains may create
          // multiple rounds of work (pause → resume → pause → resume), each
          // potentially creating a new $renderPromise$. Keep waiting until
          // all pending cursor work is done.
          if (this.$renderPromise$ || this.$pendingCount$ > 0) {
            if (this.$renderPromise$) {
              await this.$renderPromise$;
            } else {
              // pendingCount > 0 but no promise yet — yield to let microtasks run
              await Promise.resolve();
            }
            // Restore main build state after sub-cursor completion
            this.ssrBuildState = mainBuildState;
            break;
          }
          throw new Error('SSR emitter blocked on a dirty node with no pending cursor work');

        case EmitResult.BLOCKED_SUSPENSE:
          await this.waitForSuspenseProgressOrDeadline(emitter.nextSuspenseDeadline);
          this.ssrBuildState = mainBuildState;
          if (this._ssrError) {
            throw this._ssrError;
          }
          break;
      }
    }

    // Sync counters from emitter
    this.size = emitter.size;
    this.depthFirstElementCount = emitter.depthFirstElementCount;

    // Pop remaining frames (no HTML output — emitter already wrote everything)
    while (this.ssrBuildState.currentElementFrame) {
      this._closeElement();
    }
  }

  setContext<T>(host: HostElement, context: ContextId<T>, value: T): void {
    let ctx = vnode_getProp<Array<string | unknown>>(host, QCtxAttr, null);
    if (ctx == null) {
      ctx = [];
      vnode_setProp(host, QCtxAttr, ctx);
    }
    mapArray_set(ctx, context.id, value, 0, true);
    // Store the node which will store the context
    this.addRoot(host);
  }

  resolveContext<T>(host: HostElement, contextId: ContextId<T>): T | undefined {
    let ssrNode: ISsrNode | null = host as unknown as ISsrNode;
    while (ssrNode) {
      const ctx = vnode_getProp<Array<string | unknown>>(ssrNode, QCtxAttr, null);
      if (ctx != null && mapArray_has(ctx, contextId.id, 0)) {
        return mapArray_get(ctx, contextId.id, 0) as T;
      }
      ssrNode = ssrNode.parentComponent;
    }
    return undefined;
  }

  getParentHost(host: HostElement): HostElement | null {
    const ssrNode: ISsrNode = host as any;
    return ssrNode.parentComponent as unknown as HostElement | null;
  }

  setHostProp<T>(host: HostElement, name: string, value: T): void {
    vnode_setProp(host, name, value);
  }

  getHostProp<T>(host: HostElement, name: string): T | null {
    return vnode_getProp<T>(host, name, null);
  }

  /**
   * Renders opening tag for container. It could be a html tag for regular apps or custom element
   * for micro-frontends
   */
  openContainer() {
    if (this.tag == 'html') {
      // DOCTYPE is emitted directly — it's not part of the tree
      this.writer.write('<!DOCTYPE html>');
    }

    const containerAttributes = this.renderOptions.containerAttributes || {};
    const qRender = containerAttributes[QRenderAttr];
    containerAttributes[QContainerAttr] = QContainerValue.PAUSED;
    containerAttributes[QRuntimeAttr] = '2';
    containerAttributes[QVersionAttr] = this.$version$ ?? 'dev';
    containerAttributes[QRenderAttr] = (qRender ? qRender + '-' : '') + (isDev ? 'ssr-dev' : 'ssr');
    containerAttributes[QBaseAttr] = this.$buildBase$ || '';
    containerAttributes[QLocaleAttr] = this.$locale$;
    containerAttributes[QManifestHashAttr] = this.resolvedManifest.manifest.manifestHash;
    containerAttributes[QInstanceAttr] = this.$instanceHash$;

    this.$serverData$.containerAttributes = containerAttributes;

    this.openElement(this.tag, null, containerAttributes);
    if (!this.isHtml) {
      // For micro-frontends emit before closing the root custom container element.
      this.emitContainerDataFrame = this.ssrBuildState.currentElementFrame;
    }
  }

  /** Renders closing tag for current container */
  closeContainer(): ValueOrPromise<void> {
    return this.closeElement();
  }

  private $noScriptHere$: number = 0;

  /** Renders opening tag for DOM element */
  openElement(
    elementName: string,
    key: string | null,
    varAttrs: Props | null,
    constAttrs: Props | null = null,
    styleScopedId: string | null = null,
    currentFile: string | null = null,
    hasMovedCaptures: boolean = true
  ): string | undefined {
    const isQwikStyle =
      isQwikStyleElement(elementName, varAttrs) || isQwikStyleElement(elementName, constAttrs);

    if (
      // don't append qwik loader before qwik style elements
      // it will confuse the resuming, because styles are expected to be the first nodes in subtree
      !isQwikStyle &&
      this.qlInclude === QwikLoaderInclude.Inline
    ) {
      if (this.$noScriptHere$ === 0 && this.size > 30 * 1024 && elementName !== 'body') {
        // We waited long enough, on slow connections the page is already partially visible
        this.emitQwikLoaderInline();
      }
      // keep track of noscript and template, and for html we only emit inside body
      else if (elementName === 'noscript' || elementName === 'template') {
        this.$noScriptHere$++;
      }
    }

    let innerHTML: string | undefined = undefined;
    this.lastNode = null;
    if (!isQwikStyle && this.ssrBuildState.currentElementFrame) {
      if (!this._cursorDrivenRender || this._directMode) {
        vNodeData_incrementElementCount(this.ssrBuildState.currentElementFrame.vNodeData);
      }
    }

    this.createAndPushFrame(elementName, this.depthFirstElementCount++, currentFile);
    if (this.isHtml && elementName === 'body' && this.emitContainerDataFrame === null) {
      // For full document rendering emit before closing </body>.
      this.emitContainerDataFrame = this.ssrBuildState.currentElementFrame;
    }
    if (!this._cursorDrivenRender || this._directMode) {
      vNodeData_openElement(this.ssrBuildState.currentElementFrame!.vNodeData);
    }

    // create here for processAttrs to use it
    const lastNode = this.getOrCreateLastNode();

    if (this._directMode) {
      // Direct mode: write HTML immediately to stream (used by emitContainerData for script tags)
      this.writer.write(LT);
      this.writer.write(elementName);
      this.writeAttrsDirect(varAttrs);
      // Write Q_PROPS_SEPARATOR — marks this as a Qwik-managed element for client materialization
      this.writer.write(' ' + Q_PROPS_SEPARATOR);
      if (import.meta.env.TEST) {
        this.writer.write(EMPTY_ATTR);
      }
      this.writer.write(GT);
    } else {
      // Tree-building mode: process attrs (run side effects) and store on SsrNode.
      // Walker will serialize attrs to HTML at emission time.
      let varProcessed: Record<string, any> | null = null;
      let constProcessed: Record<string, any> | null = null;
      if (varAttrs) {
        const result = this.processAttrs(
          elementName,
          varAttrs,
          false,
          styleScopedId,
          currentFile,
          hasMovedCaptures
        );
        varProcessed = result.processed;
        innerHTML = result.innerHTML;
      }
      if (constAttrs && !isObjectEmpty(constAttrs)) {
        const result = this.processAttrs(
          elementName,
          constAttrs,
          true,
          styleScopedId,
          currentFile,
          hasMovedCaptures
        );
        constProcessed = result.processed;
        innerHTML = result.innerHTML || innerHTML;
      }

      const ssrNode = lastNode as unknown as SsrNode;
      if (varProcessed) {
        vnode_setProp(ssrNode, SSR_VAR_ATTRS, varProcessed);
      }
      if (constProcessed) {
        vnode_setProp(ssrNode, SSR_CONST_ATTRS, constProcessed);
      }
      if (styleScopedId) {
        vnode_setProp(ssrNode, SSR_STYLE_SCOPED_ID, styleScopedId);
      }
      ssrNode.key = key;
      ssrNode.tagName = elementName;
      ssrNode.nodeKind = SsrNodeKind.Element;

      // Store SsrNode on frame for child tracking
      this.ssrBuildState.currentElementFrame!.ssrNode = lastNode;

      // Add as ordered child of parent element
      const parentSsrNode = this.ssrBuildState.currentElementFrame!.parent?.ssrNode;
      if (parentSsrNode) {
        ssrNode_addOrderedChild(parentSsrNode as SsrNode, lastNode);
      }

      // Mark as non-updatable: attrs are captured, any signal changes after this need backpatching
      ssrNode_setTreeNonUpdatable(lastNode);
    }

    return innerHTML;
  }

  /** Renders closing tag for DOM element */
  closeElement(): ValueOrPromise<void> {
    if (
      !this._cursorDrivenRender &&
      this.ssrBuildState.currentElementFrame === this.emitContainerDataFrame
    ) {
      // Manual rendering path (container.spec.tsx toHTML): emit tree + container data.
      this.emitContainerDataFrame = null;
      this.onRenderDone();
      const snapshotTimer = createTimer();

      // Emit the entire tree (including open/close tags) via streaming walker.
      // The walker's onBeforeContainerClose callback emits container data scripts.
      const rootSsrNode = this.ssrBuildState.currentElementFrame!.ssrNode;
      if (rootSsrNode) {
        this._directMode = true;
        const walker = new SsrStreamingWalker({
          writer: this.writer,
          containerDataNode: rootSsrNode,
          onBeforeContainerClose: () => this.emitContainerData(),
          suspenseBoundaries: this.suspenseBoundaries,
          suspenseFallbackDelay: this.suspenseFallbackDelay,
          onSuspenseFallback: (node) => this.markSuspenseFallbackEmitted(node),
          waitForSuspense: (deadline) => this.waitForSuspenseProgressOrDeadline(deadline),
        });
        const result = walker.emitTree(rootSsrNode);
        return maybeThen(result, () => {
          this._directMode = false;
          // Pop the frame (walker already wrote the close tag)
          this.popFrame();
          this.lastNode = null;
          this.timing.snapshot = snapshotTimer();
        });
      }

      // No tree built — just pop
      this.popFrame();
      this.lastNode = null;
      this.timing.snapshot = snapshotTimer();
      return;
    }
    this._closeElement();
  }

  private onRenderDone() {
    // cleanup tasks etc.
    this.drainCleanupQueue();
    // set render time
    this.timing.render = this.renderTimer();
  }

  /** Drain cleanup queue and cleanup tasks etc. */
  private drainCleanupQueue() {
    let sequences = this.cleanupQueue.pop();
    while (sequences) {
      for (let j = 0; j < sequences.length; j++) {
        const item = sequences[j];
        if (hasDestroy(item)) {
          item.$destroy$();
        }
      }
      sequences = this.cleanupQueue.pop();
    }
  }

  private _closeElement() {
    const currentFrame = this.popFrame();
    const elementName = currentFrame.elementName!;
    if (this._directMode && !isSelfClosingTag(elementName)) {
      this.writer.write(CLOSE_TAG);
      this.writer.write(elementName);
      this.writer.write(GT);
    }
    // In tree-building mode, walker handles close tags
    this.lastNode = null;
    if (this.qlInclude === QwikLoaderInclude.Inline) {
      if (elementName === 'noscript' || elementName === 'template') {
        this.$noScriptHere$--;
      }
    }
  }

  /** Writes opening data to vNodeData for fragment boundaries */
  openFragment(attrs: Props) {
    this.lastNode = null;
    let node: ISsrNode;
    if (this._cursorDrivenRender && !this._directMode) {
      // Cursor-driven render: create SsrNode directly with attrs (no vNodeData needed —
      // the emitter handles vNodeData building during emission).
      node = new SsrNode(
        this.ssrBuildState.currentComponentNode,
        '', // placeholder ID — emitter assigns real ID via trackVirtualOpen
        Object.isFrozen(attrs) ? { ...attrs } : attrs,
        this.cleanupQueue,
        this.ssrBuildState.currentElementFrame!.currentFile
      );
      this.lastNode = node;
    } else {
      vNodeData_openFragment(this.ssrBuildState.currentElementFrame!.vNodeData, attrs);
      node = this.getOrCreateLastNode();
    }
    (node as SsrNode).nodeKind = SsrNodeKind.Virtual;
    // Add as ordered child of current element
    const parentSsrNode = this.ssrBuildState.currentElementFrame?.ssrNode;
    if (parentSsrNode) {
      ssrNode_addOrderedChild(parentSsrNode as SsrNode, node);
    }
    // Push the current ssrNode and set the fragment as the new parent for children
    this.ssrBuildState.ssrNodeStack.push(this.ssrBuildState.currentElementFrame?.ssrNode ?? null);
    if (this.ssrBuildState.currentElementFrame) {
      this.ssrBuildState.currentElementFrame.ssrNode = node;
    }
  }

  /** Writes closing data to vNodeData for fragment boundaries */
  closeFragment() {
    if (!this._cursorDrivenRender || this._directMode) {
      vNodeData_closeFragment(this.ssrBuildState.currentElementFrame!.vNodeData);
    }

    // Restore the previous ssrNode parent
    const prev = this.ssrBuildState.ssrNodeStack.pop() ?? null;
    if (this.ssrBuildState.currentElementFrame) {
      this.ssrBuildState.currentElementFrame.ssrNode = prev;
    }
    this.lastNode = null;
  }

  openProjection(attrs: Props) {
    this.openFragment(attrs);
    const componentFrame = this.getComponentFrame();
    if (componentFrame) {
      // TODO: we should probably serialize only projection VNode
      this.serializationCtx.$addRoot$(componentFrame.componentNode);
      componentFrame.projectionDepth++;
    }
  }

  closeProjection() {
    const componentFrame = this.getComponentFrame();
    if (componentFrame) {
      componentFrame.projectionDepth--;
    }
    this.closeFragment();
  }

  /**
   * Opens a Suspense boundary node. Assigns a placeholder ID for OoO streaming. In direct streaming
   * mode, emits the placeholder div immediately. In tree-building mode (deferred content), tags the
   * node for the streaming walker.
   */
  openSuspenseBoundary(attrs: Props) {
    this.openFragment(attrs);
    const node = this.getOrCreateLastNode();
    const placeholderId = `qph-${this.suspensePlaceholderCounter++}`;
    vnode_setProp(node, SSR_SUSPENSE_PLACEHOLDER_ID, placeholderId);
    (node as SsrNode).nodeKind = SsrNodeKind.Suspense;
    this.currentSuspenseBoundary = node;
  }

  /** Closes the Suspense boundary. Marks the boundary for the streaming walker. */
  closeSuspenseBoundary() {
    const boundary = this.currentSuspenseBoundary;
    if (boundary) {
      vnode_setProp(boundary, SSR_SUSPENSE_FALLBACK, true);
      this.currentSuspenseBoundary = null;
    }
    this.closeFragment();
  }

  /**
   * Creates a sub-cursor for Suspense children. The sub-cursor builds children SsrNodes under a
   * content node with its own SsrBuildState. When the sub-cursor completes, it marks the boundary
   * as ready so the streaming walker can emit children inline instead of using OoO.
   *
   * Called from ssrDiff when encountering Suspense with children.
   */
  createSuspenseSubCursor(childrenJsx: JSXOutput) {
    const boundary = this.currentSuspenseBoundary;
    if (!boundary) {
      return;
    }
    const placeholderId = vnode_getProp<string>(boundary, SSR_SUSPENSE_PLACEHOLDER_ID, null)!;

    // Create a content SsrNode to hold children built by the sub-cursor
    const contentNode = new SsrNode(
      null, // parentComponent
      `sus-${placeholderId}`,
      {}, // attrs
      this.cleanupQueue,
      null // currentFile
    );
    contentNode.vnodeData = [VNodeDataFlag.NONE] as VNodeData;
    contentNode.nodeKind = SsrNodeKind.Virtual;
    vnode_setProp(boundary, SSR_SUSPENSE_CONTENT, contentNode);

    // Create a separate SsrBuildState for the sub-cursor
    const childBuildState = createSsrBuildState();
    const deferredFrame: ElementFrame = {
      tagNesting: TagNesting.ANYTHING,
      parent: null,
      elementName: 'template',
      depthFirstElementIdx: -1,
      vNodeData: [VNodeDataFlag.NONE] as VNodeData,
      currentFile: null,
      ssrNode: contentNode,
    };
    childBuildState.currentElementFrame = deferredFrame;
    this.vNodeDatas.push(deferredFrame.vNodeData);

    // Create VirtualVNode for sub-cursor root
    const cursorRoot = new VirtualVNode(
      null, // key
      VNodeFlags.Virtual,
      null, // parent
      null, // previousSibling
      null, // nextSibling
      { ':nodeDiff': childrenJsx },
      null, // firstChild
      null // lastChild
    );
    cursorRoot.dirty = ChoreBits.NODE_DIFF;

    // Create sub-cursor with higher priority (-1) so it runs before the streaming phase
    const cursor = addCursor(this, cursorRoot, -1);
    const cursorData = getCursorData(cursor)!;
    cursorData.ssrBuildState = childBuildState;

    // When sub-cursor completes, mark boundary as ready
    cursorData.onDone = () => {
      vnode_setProp(boundary, SSR_SUSPENSE_READY, true);
    };

    // Track this boundary for potential OoO streaming (if sub-cursor doesn't complete in time)
    this.suspenseBoundaries.push({
      node: boundary,
      placeholderId,
      contentNode,
      createdAt: 0,
      fallbackEmitted: false,
    });
  }

  /**
   * Returns the current component frame.
   *
   * @param projectionDepth - How many levels of projection to skip. This is needed when projections
   *   are nested inside other projections we need to have a way to read from a frame above.
   * @returns
   */
  getComponentFrame(projectionDepth: number = 0): ISsrComponentFrame | null {
    const length = this.ssrBuildState.componentStack.length;
    const idx = length - projectionDepth - 1;
    return idx >= 0 ? this.ssrBuildState.componentStack[idx] : null;
  }

  getParentComponentFrame(): ISsrComponentFrame | null {
    const localProjectionDepth = this.getComponentFrame()?.projectionDepth || 0;
    return this.getComponentFrame(localProjectionDepth);
  }

  enterComponentContext(componentNode: ISsrNode, existingFrame?: ISsrComponentFrame): void {
    // Push fragment context: save current ssrNode and set component as new parent
    this.ssrBuildState.ssrNodeStack.push(this.ssrBuildState.currentElementFrame?.ssrNode ?? null);

    // Push a synthetic element frame for the component boundary.
    // Use the tag nesting that was stored during tree-building (the parent element's nesting).
    const storedTagNesting = vnode_getProp<TagNesting>(componentNode, ':parentTagNesting', null);
    const parentFrame = this.ssrBuildState.currentElementFrame;
    const syntheticFrame: ElementFrame = {
      tagNesting: storedTagNesting ?? (parentFrame ? parentFrame.tagNesting : TagNesting.ANYTHING),
      parent: parentFrame,
      elementName: ':component',
      depthFirstElementIdx: this.depthFirstElementCount,
      vNodeData: [VNodeDataFlag.NONE] as VNodeData,
      currentFile: null,
      ssrNode: componentNode,
    };
    this.ssrBuildState.currentElementFrame = syntheticFrame;

    // Set up component tracking
    this.ssrBuildState.currentComponentNode = componentNode;
    this.ssrBuildState.componentStack.push(existingFrame || new SsrComponentFrame(componentNode));
  }

  /**
   * Restore SsrBuildState after executing within a component. Mirrors enterComponentContext. Pops
   * fragment and component context. Unclaimed projections are NOT emitted here — they are deferred
   * to executeSsrUnclaimedProjections (called by cursor walker after CHILDREN processing), because
   * deferred child components may consume slots during their execution via Slot resolution.
   */
  leaveComponentContext(): void {
    this.ssrBuildState.componentStack.pop();

    // Pop synthetic element frame pushed by enterComponentContext
    if (this.ssrBuildState.currentElementFrame) {
      this.ssrBuildState.currentElementFrame = this.ssrBuildState.currentElementFrame.parent;
    }
    // Restore fragment context
    const prev = this.ssrBuildState.ssrNodeStack.pop() ?? null;
    if (this.ssrBuildState.currentElementFrame) {
      this.ssrBuildState.currentElementFrame.ssrNode = prev;
    }
    this.lastNode = null;
    // Restore component parent
    this.ssrBuildState.currentComponentNode =
      this.ssrBuildState.currentComponentNode?.parentComponent || null;
  }

  /**
   * Creates a component frame and distributes children into slots WITHOUT modifying walker context.
   * Used by ssrComponent during tree-building to set up deferred component state.
   */
  createAndDistributeComponentFrame(
    host: ISsrNode,
    children: JSXChildren,
    parentScopedStyle: string | null,
    parentComponentFrame: ISsrComponentFrame | null
  ): ISsrComponentFrame {
    const frame = new SsrComponentFrame(host);
    frame.distributeChildrenIntoSlots(
      children,
      parentScopedStyle,
      parentComponentFrame as SsrComponentFrame | null
    );
    return frame;
  }

  emitUnclaimedProjectionForComponent(componentFrame: ISsrComponentFrame): ValueOrPromise<void> {
    if (componentFrame.slots.length === 0) {
      return;
    }
    // Capture and clear slots eagerly to prevent re-emission if the cursor walker revisits
    // this node before the async processing completes (slots is a mapArray: [key, value, ...]).
    const slots = componentFrame.slots.slice();
    componentFrame.slots.length = 0;
    return this._emitUnclaimedProjectionAsync(componentFrame, slots);
  }

  private async _emitUnclaimedProjectionAsync(
    componentFrame: ISsrComponentFrame,
    slots: (string | JSXChildren)[]
  ): Promise<void> {
    this.openElement(QTemplate, null, QTemplateProps, null);

    const scopedStyleId = componentFrame.projectionScopedStyle;
    for (let i = 0; i < slots.length; i += 2) {
      const slotName = slots[i] as string;
      const children = slots[i + 1] as JSXOutput;

      this.openFragment(
        isDev
          ? { [DEBUG_TYPE]: VirtualType.Projection, [QSlotParent]: componentFrame.componentNode }
          : { [QSlotParent]: componentFrame.componentNode }
      );
      const lastNode = this.getOrCreateLastNode();
      if (lastNode.vnodeData) {
        lastNode.vnodeData[0] |= VNodeDataFlag.SERIALIZE;
      }
      vnode_setProp(componentFrame.componentNode, slotName, lastNode);
      // Connect VNode parent chain so markVNodeDirty can walk up to cursor root
      // when deferred components are found inside unclaimed projections
      const lastNodeVNode = lastNode as unknown as VirtualVNode;
      if (!lastNodeVNode.parent) {
        lastNodeVNode.parent = componentFrame.componentNode as unknown as VirtualVNode;
      }
      // Use projectionComponentFrame so that Slots can find their projections from the correct parent
      await ssrDiff(
        this,
        children,
        lastNode as any, // parentVNode
        this._activeCursor,
        scopedStyleId,
        componentFrame.projectionComponentFrame
      );
      this.closeFragment();
    }

    this.closeElement();
  }

  /** Write a text node with correct escaping. Save the length of the text node in the vNodeData. */
  textNode(text: string) {
    if (this._directMode) {
      this.writer.write(escapeHTML(text));
    } else {
      const escaped = escapeHTML(text);
      this.size += escaped.length;
      const parentSsrNode = this.ssrBuildState.currentElementFrame?.ssrNode;
      if (parentSsrNode) {
        ssrNode_addOrderedChild(parentSsrNode as SsrNode, {
          kind: SsrNodeKind.Text,
          content: escaped,
          textLength: text.length,
        });
      }
    }
    if (!this._cursorDrivenRender || this._directMode) {
      vNodeData_addTextSize(this.ssrBuildState.currentElementFrame!.vNodeData, text.length);
    }
    this.lastNode = null;
  }

  htmlNode(rawHtml: string) {
    if (this._directMode) {
      this.writer.write(rawHtml);
    } else {
      this.size += rawHtml.length;
      const parentSsrNode = this.ssrBuildState.currentElementFrame?.ssrNode;
      if (parentSsrNode) {
        ssrNode_addOrderedChild(parentSsrNode as SsrNode, {
          kind: SsrNodeKind.RawHtml,
          content: rawHtml,
        });
      }
    }
  }

  commentNode(text: string) {
    if (this._directMode) {
      this.writer.write('<!--' + text + '-->');
    } else {
      this.size += text.length + 7; // 7 = '<!--' + '-->'
      const parentSsrNode = this.ssrBuildState.currentElementFrame?.ssrNode;
      if (parentSsrNode) {
        ssrNode_addOrderedChild(parentSsrNode as SsrNode, {
          kind: SsrNodeKind.Comment,
          content: text,
        });
      }
    }
  }

  addRoot(obj: unknown) {
    if (this.$noMoreRoots$) {
      return this.serializationCtx.$hasRootId$(obj);
    }
    return this.serializationCtx.$addRoot$(obj);
  }

  getOrCreateLastNode(): ISsrNode {
    if (!this.lastNode) {
      if (this._cursorDrivenRender && !this._directMode) {
        // Cursor-driven render: create SsrNode without vNodeData — the emitter handles
        // vNodeData building and REFERENCE flag during emission.
        // Still assign ID here because backpatching needs it during tree-building.
        this.lastNode = new SsrNode(
          this.ssrBuildState.currentComponentNode,
          String(this.ssrBuildState.currentElementFrame!.depthFirstElementIdx + 1),
          {}, // standalone attrs
          this.cleanupQueue,
          this.ssrBuildState.currentElementFrame!.currentFile
        );
      } else {
        // Direct mode / manual rendering: use vNodeData_createSsrNodeReference for full
        // vNodeData path computation and ID assignment.
        this.lastNode = vNodeData_createSsrNodeReference(
          this.ssrBuildState.currentComponentNode,
          this.ssrBuildState.currentElementFrame!.vNodeData,
          // we start at -1, so we need to add +1
          this.ssrBuildState.currentElementFrame!.depthFirstElementIdx + 1,
          this.cleanupQueue,
          this.ssrBuildState.currentElementFrame!.currentFile
        );
      }
    }
    return this.lastNode!;
  }

  addUnclaimedProjection(frame: ISsrComponentFrame, name: string, children: JSXChildren): void {
    // With inline emission, just add the children back to the frame's slots
    // They will be emitted when the component closes
    frame.slots.push(name, children);
  }

  private $processInjectionsFromManifest$(): void {
    const injections = this.resolvedManifest.manifest.injections;
    if (!injections) {
      return;
    }

    for (let i = 0; i < injections.length; i++) {
      const injection = injections[i];

      const jsxNode = _jsxSplit(injection.tag, null, injection.attributes || {}, null, 0, null);
      if (injection.location === 'head') {
        this.additionalHeadNodes.push(jsxNode);
      } else {
        this.additionalBodyNodes.push(jsxNode);
      }
    }
  }

  $appendStyle$(content: string, styleId: string, host: HostElement, scoped: boolean): void {
    if (scoped) {
      const componentFrame = this.getComponentFrame(0)!;
      componentFrame.scopedStyleIds.add(styleId);
      const scopedStyleIds = convertStyleIdsToString(componentFrame.scopedStyleIds);
      this.setHostProp(host, QScopedStyle, scopedStyleIds);
    }

    if (!this.styleIds.has(styleId)) {
      this.styleIds.add(styleId);
      if (this._isInsideHtmlElement()) {
        this.additionalHeadNodes.push(
          _jsxSorted(
            'style',
            null,
            { dangerouslySetInnerHTML: content, [QStyle]: styleId },
            null,
            0,
            styleId
          )
        );
      } else {
        this._styleNode(styleId, content);
      }
    }
  }

  /**
   * Check if the nearest real element frame is 'html'. Looks through synthetic ':component' frames
   * pushed by enterComponentContext, using the stored parent element name from tree-building time.
   */
  private _isInsideHtmlElement(): boolean {
    const frame = this.ssrBuildState.currentElementFrame;
    if (!frame) {
      return false;
    }
    if (frame.elementName === ':component') {
      // Use stored parent element name from tree-building time
      const storedName = frame.ssrNode
        ? vnode_getProp(frame.ssrNode, ':parentElementName', null)
        : null;
      return storedName === 'html';
    }
    return frame.elementName === 'html';
  }

  private _styleNode(styleId: string, content: string) {
    this.openElement('style', null, {
      [QStyle]: styleId,
    });
    this.write(content);
    this.closeElement();
  }

  ////////////////////////////////////

  private emitContainerData(): ValueOrPromise<void> {
    // TODO first emit state, then only emit slots where the parent is serialized (so they could rerender)
    return maybeThen(this.resolvePromiseAttributes(), () =>
      maybeThen(this.emitStateData(), () => {
        this.$noMoreRoots$ = true;
        this.emitVNodeData();
        preloaderPost(this, this.renderOptions, this.$serverData$?.nonce);
        this.emitSyncFnsData();
        this.emitPatchDataIfNeeded();
        this.emitExecutorIfNeeded();
        this.emitQwikLoaderAtBottomIfNeeded();
      })
    );
  }

  /**
   * Serialize the vNodeData into a string and emit it as a script tag.
   *
   * ## Encoding:
   *
   * - Alphabetical characters are text node lengths.
   * - Numbers are element counts.
   * - `{` is start of virtual node.
   * - `}` is end of virtual node.
   * - `~` Store as reference for data deserialization.
   * - `!"#$%&'()*+'-./` are separators (sequential characters in ASCII table)
   *
   * Attribute and separators encoding described here:
   * `packages/qwik/src/core/v2/shared/vnode-data-types.ts`
   *
   * NOTE: Not every element will need vNodeData. So we need to encode how many elements should be
   * skipped. By choosing different separators we can encode different numbers of elements to skip.
   */
  emitVNodeData() {
    if (!this.serializationCtx.$roots$.length) {
      return;
    }
    this.openElement('script', null, { type: 'qwik/vnode' });
    const vNodeAttrsStack: Props[] = [];
    const vNodeData = this.vNodeDatas;
    let lastSerializedIdx = 0;

    for (let elementIdx = 0; elementIdx < vNodeData.length; elementIdx++) {
      const vNode = vNodeData[elementIdx];
      const flag = vNode[0];
      if (flag & VNodeDataFlag.SERIALIZE) {
        lastSerializedIdx = this.emitVNodeSeparators(lastSerializedIdx, elementIdx);
        if (flag & VNodeDataFlag.REFERENCE) {
          this.write(VNodeDataSeparator.REFERENCE_CH);
        }
        if (
          flag &
          (VNodeDataFlag.TEXT_DATA | VNodeDataFlag.VIRTUAL_NODE | VNodeDataFlag.ELEMENT_NODE)
        ) {
          let fragmentAttrs: Props | null = null;
          /**
           * We keep track of how many virtual open/close fragments we have seen so far. Normally we
           * should not have to do it, but if you put a fragment around `<body>` tag than we start
           * emitting before `<body/>` close tag. This means that the system did not get a chance to
           * insert the close fragment. So we just assume that there will be nothing else and
           * auto-close.
           */
          let depth = 0;
          for (let i = 1; i < vNode.length; i++) {
            const value = vNode[i];
            if (typeof value === 'object' && value !== null) {
              vNodeAttrsStack.push(fragmentAttrs!);
              fragmentAttrs = value;
            } else if (value === OPEN_FRAGMENT) {
              depth++;
              this.write(VNodeDataChar.OPEN_CHAR);
            } else if (value === CLOSE_FRAGMENT) {
              // write out fragment attributes
              if (fragmentAttrs) {
                this.writeFragmentAttrs(fragmentAttrs);
                fragmentAttrs = vNodeAttrsStack.pop()!;
              }
              depth--;
              this.write(VNodeDataChar.CLOSE_CHAR);
            } else if (value === WRITE_ELEMENT_ATTRS) {
              // this is executed only for VNodeDataFlag.ELEMENT_NODE and written as `||some encoded attrs here||`
              if (fragmentAttrs && !isObjectEmpty(fragmentAttrs)) {
                // double `|` to handle the case when the separator character is also at the beginning or end of the string
                this.write(VNodeDataChar.SEPARATOR_CHAR);
                this.write(VNodeDataChar.SEPARATOR_CHAR);
                this.writeFragmentAttrs(fragmentAttrs);
                this.write(VNodeDataChar.SEPARATOR_CHAR);
                this.write(VNodeDataChar.SEPARATOR_CHAR);
                fragmentAttrs = vNodeAttrsStack.pop()!;
              }
            } else if (value >= 0) {
              // Text nodes get encoded as alphanumeric characters.
              this.write(encodeAsAlphanumeric(value));
            } else {
              // Element counts get encoded as numbers.
              this.write(String(0 - value));
            }
          }
          while (depth-- > 0) {
            if (fragmentAttrs) {
              this.writeFragmentAttrs(fragmentAttrs);
              fragmentAttrs = vNodeAttrsStack.pop()!;
            }
            this.write(VNodeDataChar.CLOSE_CHAR);
          }
        }
      }
    }

    this.closeElement();
  }

  private writeFragmentAttrs(fragmentAttrs: Props): void {
    for (const key in fragmentAttrs) {
      // Skip non-serializable props (NON_SERIALIZABLE_MARKER_PREFIX ':')
      if (key.charCodeAt(0) === 58) {
        continue;
      }
      const rawValue = fragmentAttrs[key];
      let value: string;
      let encodeValue = false;
      if (rawValue instanceof SsrNode) {
        // SsrNode reference — resolve to ID at serialization time
        value = rawValue.id;
      } else if (typeof rawValue !== 'string') {
        const rootId = this.addRoot(rawValue);
        // We didn't add the vnode data, so we are only interested in the vnode position
        if (rootId === undefined) {
          continue;
        }
        value = String(rootId);
      } else {
        value = rawValue;
      }
      switch (key) {
        case QScopedStyle:
          this.write(VNodeDataChar.SCOPED_STYLE_CHAR);
          break;
        case OnRenderProp:
          this.write(VNodeDataChar.RENDER_FN_CHAR);
          break;
        case ELEMENT_ID:
          this.write(VNodeDataChar.ID_CHAR);
          break;
        case ELEMENT_PROPS:
          this.write(VNodeDataChar.PROPS_CHAR);
          break;
        case ELEMENT_KEY:
          encodeValue = true;
          this.write(VNodeDataChar.KEY_CHAR);
          break;
        case ELEMENT_SEQ:
          this.write(VNodeDataChar.SEQ_CHAR);
          break;
        case ELEMENT_SEQ_IDX:
          this.write(VNodeDataChar.SEQ_IDX_CHAR);
          break;
        case QBackRefs:
          this.write(VNodeDataChar.BACK_REFS_CHAR);
          break;
        case QSlotParent:
          this.write(VNodeDataChar.SLOT_PARENT_CHAR);
          break;
        // Skipping `\` character for now because it is used for escaping.
        case QCtxAttr:
          this.write(VNodeDataChar.CONTEXT_CHAR);
          break;
        case QSlot:
          this.write(VNodeDataChar.SLOT_CHAR);
          break;
        default: {
          encodeValue = true;
          this.write(VNodeDataChar.SEPARATOR_CHAR);
          this.write(encodeVNodeDataString(key));
          this.write(VNodeDataChar.SEPARATOR_CHAR);
        }
      }
      const encodedValue = encodeVNodeDataString(encodeValue ? encodeURI(value) : value);
      const isEncoded = encodeValue ? encodedValue !== value : false;
      if (isEncoded) {
        // add separator only before and after the encoded value
        this.write(VNodeDataChar.SEPARATOR_CHAR);
        this.write(encodedValue);
        this.write(VNodeDataChar.SEPARATOR_CHAR);
      } else {
        this.write(value);
      }
    }
  }

  private emitStateData(): ValueOrPromise<void> {
    if (!this.serializationCtx.$roots$.length) {
      return;
    }

    const attrs = this.stateScriptAttrs();

    this.openElement('script', null, attrs);
    return maybeThen(this.serializationCtx.$serialize$(), () => {
      this.closeElement();
    });
  }

  /** Add q-d:qidle attribute to eagerly resume some state if needed */
  private stateScriptAttrs(): Props {
    const attrs: Props = { type: 'qwik/state' };
    const eagerResume = this.serializationCtx.$eagerResume$;
    if (eagerResume.size > 0) {
      attrs['q-d:qidle'] = createQRL(null, '_res', _res, null, [...eagerResume]);
    }
    return attrs;
  }

  private emitSyncFnsData() {
    const fns = this.serializationCtx.$syncFns$;
    if (fns.length) {
      const scriptAttrs: Record<string, string> = { 'q:func': 'qwik/json' };
      if (this.renderOptions.serverData?.nonce) {
        scriptAttrs['nonce'] = this.renderOptions.serverData.nonce;
      }
      this.openElement('script', null, scriptAttrs);
      this.write(Q_FUNCS_PREFIX.replace('HASH', this.$instanceHash$));
      this.write(BRACKET_OPEN);
      this.writeArray(fns, COMMA);
      this.write(BRACKET_CLOSE);
      this.closeElement();
    }
  }

  emitPatchDataIfNeeded(): void {
    const patches: (string | number | boolean | null)[] = [];
    for (const [elementIndex, backpatchEntries] of this.backpatchMap) {
      for (const backpatchEntry of backpatchEntries) {
        patches.push(
          elementIndex,
          backpatchEntry.attrName,
          isSignal(backpatchEntry.value)
            ? (backpatchEntry.value as unknown as SignalImpl<string>).untrackedValue
            : (backpatchEntry.value as string)
        );
      }
    }
    // Resolve deferred backpatch entries (cursor-driven mode) using emission-time element indices.
    // Must be sorted by element index because the backpatch executor's TreeWalker only moves forward.
    if (this.backpatchNodeMap.size > 0) {
      const deferredPatches: { elementIndex: number; entries: BackpatchEntry[] }[] = [];
      for (const [ssrNode, backpatchEntries] of this.backpatchNodeMap) {
        const elementIndex = parseInt(ssrNode.id, 10);
        deferredPatches.push({ elementIndex, entries: backpatchEntries });
      }
      deferredPatches.sort((a, b) => a.elementIndex - b.elementIndex);
      for (const { elementIndex, entries } of deferredPatches) {
        for (const backpatchEntry of entries) {
          patches.push(
            elementIndex,
            backpatchEntry.attrName,
            isSignal(backpatchEntry.value)
              ? (backpatchEntry.value as unknown as SignalImpl<string>).untrackedValue
              : (backpatchEntry.value as string)
          );
        }
      }
    }

    this.backpatchMap.clear();
    this.backpatchNodeMap.clear();

    if (patches.length > 0) {
      this.isBackpatchExecutorEmitted = true;
      const scriptAttrs: Record<string, string> = { type: ELEMENT_BACKPATCH_DATA };
      if (this.renderOptions.serverData?.nonce) {
        scriptAttrs['nonce'] = this.renderOptions.serverData.nonce;
      }
      this.openElement('script', null, scriptAttrs);
      this.write(JSON.stringify(patches));
      this.closeElement();
    }
  }

  private emitExecutorIfNeeded(): void {
    if (!this.isBackpatchExecutorEmitted) {
      return;
    }

    const scriptAttrs: Record<string, string> = { type: 'text/javascript' };
    if (this.renderOptions.serverData?.nonce) {
      scriptAttrs['nonce'] = this.renderOptions.serverData.nonce;
    }
    this.openElement('script', null, scriptAttrs);

    const backpatchScript = getQwikBackpatchExecutorScript({ debug: isDev });
    this.write(backpatchScript);

    this.closeElement();
  }

  emitPreloaderPre() {
    preloaderPre(this, this.renderOptions.preloader, this.renderOptions.serverData?.nonce);
  }

  isStatic(): boolean {
    return this.serializationCtx.$eventQrls$.size === 0;
  }

  emitQwikLoaderAtTopIfNeeded() {
    if (this.qlInclude === QwikLoaderInclude.Module) {
      this.qlInclude = QwikLoaderInclude.Done;
      // always emit the preload+import. It will probably be used at some point on the site
      const qwikLoaderBundle = this.$buildBase$ + this.resolvedManifest.manifest.qwikLoader!;
      const linkAttrs: Record<string, string> = { rel: 'modulepreload', href: qwikLoaderBundle };
      const nonce = this.renderOptions.serverData?.nonce;
      if (nonce) {
        linkAttrs['nonce'] = nonce;
      }
      this.openElement('link', null, linkAttrs);
      this.closeElement();
      // browser must support modules for Qwik to work
      const scriptAttrs: Record<string, string | boolean> = {
        async: true,
        type: 'module',
        src: qwikLoaderBundle,
      };
      if (nonce) {
        scriptAttrs['nonce'] = nonce;
      }
      this.openElement('script', null, scriptAttrs);
      this.closeElement();
    }
  }

  emitQwikLoaderInline() {
    this.qlInclude = QwikLoaderInclude.Done;
    // if at the end, only include when snapshot is not static
    const qwikLoaderScript = getQwikLoaderScript({ debug: this.renderOptions.debug });
    // module + async lets it run asap without waiting for DOM, even when inline
    const scriptAttrs: Record<string, string | boolean> = {
      id: 'qwikloader',
      async: true,
      type: 'module',
    };
    if (this.renderOptions.serverData?.nonce) {
      scriptAttrs['nonce'] = this.renderOptions.serverData.nonce;
    }
    this.openElement('script', null, scriptAttrs);
    this.write(qwikLoaderScript);
    this.closeElement();
  }

  private emitQwikLoaderAtBottomIfNeeded() {
    if (!this.isStatic()) {
      if (this.qlInclude !== QwikLoaderInclude.Done) {
        this.emitQwikLoaderInline();
      }
      // emit the used events so the loader can subscribe to them
      this.emitQwikEvents(Array.from(this.serializationCtx.$eventNames$, (s) => JSON.stringify(s)));
    }
  }

  private emitQwikEvents(eventNames: string[]) {
    if (eventNames.length > 0) {
      // TODO fix qwikloader so it handles qvisible added after init
      // const scriptAttrs = ['async', true, 'type', 'module'];
      const scriptAttrs: Record<string, string> = {};
      const nonce = this.renderOptions.serverData?.nonce;
      if (nonce) {
        scriptAttrs['nonce'] = nonce;
      }
      this.openElement('script', null, scriptAttrs);
      this.write(`(window._qwikEv||(window._qwikEv=[])).push(`);
      this.writeArray(eventNames, COMMA);
      this.write(PAREN_CLOSE);
      this.closeElement();
    }
  }

  // Keep in sync with process-vnode-data.unit.ts
  private emitVNodeSeparators(lastSerializedIdx: number, elementIdx: number): number {
    let skipCount = elementIdx - lastSerializedIdx;
    // console.log('emitVNodeSeparators', lastSerializedIdx, elementIdx, skipCount);
    while (skipCount != 0) {
      if (skipCount >= 8192) {
        this.write(VNodeDataSeparator.ADVANCE_8192_CH);
        skipCount -= 8192;
      } else {
        skipCount & 4096 && this.write(VNodeDataSeparator.ADVANCE_4096_CH);
        skipCount & 2048 && this.write(VNodeDataSeparator.ADVANCE_2048_CH);
        skipCount & 1024 && this.write(VNodeDataSeparator.ADVANCE_1024_CH);
        skipCount & 512 && this.write(VNodeDataSeparator.ADVANCE_512_CH);
        skipCount & 256 && this.write(VNodeDataSeparator.ADVANCE_256_CH);
        skipCount & 128 && this.write(VNodeDataSeparator.ADVANCE_128_CH);
        skipCount & 64 && this.write(VNodeDataSeparator.ADVANCE_64_CH);
        skipCount & 32 && this.write(VNodeDataSeparator.ADVANCE_32_CH);
        skipCount & 16 && this.write(VNodeDataSeparator.ADVANCE_16_CH);
        skipCount & 8 && this.write(VNodeDataSeparator.ADVANCE_8_CH);
        skipCount & 4 && this.write(VNodeDataSeparator.ADVANCE_4_CH);
        skipCount & 2 && this.write(VNodeDataSeparator.ADVANCE_2_CH);
        skipCount & 1 && this.write(VNodeDataSeparator.ADVANCE_1_CH);
        skipCount = 0;
      }
    }
    return elementIdx;
  }

  private createAndPushFrame(
    elementName: string,
    depthFirstElementIdx: number,
    currentFile?: string | null
  ) {
    let tagNesting: TagNesting = TagNesting.ANYTHING;
    if (isDev && !this._directMode) {
      if (!this.ssrBuildState.currentElementFrame) {
        tagNesting = initialTag(elementName);
      } else {
        let frame: ElementFrame | null = this.ssrBuildState.currentElementFrame;
        const previousTagNesting = frame!.tagNesting;
        tagNesting = isTagAllowed(previousTagNesting, elementName);
        if (tagNesting === TagNesting.NOT_ALLOWED) {
          const frames: ElementFrame[] = [];
          while (frame) {
            frames.unshift(frame);
            frame = frame.parent;
          }
          const text: string[] = [];

          if (currentFile) {
            text.push(`Error found in file: ${currentFile}`);
          }

          text.push(
            `HTML rules do not allow '<${elementName}>' at this location.`,
            `  (The HTML parser will try to recover by auto-closing or inserting additional tags which will confuse Qwik when it resumes.)`,
            `  Offending tag: <${elementName}>`,
            `  Existing tag context:`
          );
          let indent = '    ';
          let lastName = '';
          for (const frame of frames) {
            const [name, example] = allowedContent(frame.tagNesting);
            text.push(
              `${indent}<${frame.elementName}>${
                lastName !== name ? ` [${name}]${example ? ` -> ${example}` : ''}` : ''
              }`
            );
            lastName = name;
            indent += ' ';
          }
          text.push(
            `${indent}<${elementName}> <= is not allowed as a child of ${
              allowedContent(previousTagNesting)[0]
            }.`
          );
          throw newTagError(text.join('\n'));
        }
      }
    }
    const frame: ElementFrame = {
      tagNesting,
      parent: this.ssrBuildState.currentElementFrame,
      elementName,
      depthFirstElementIdx,
      vNodeData: [VNodeDataFlag.NONE],
      currentFile: isDev ? currentFile || null : null,
      ssrNode: null,
    };
    this.ssrBuildState.currentElementFrame = frame;
    // When the emitter is active (cursor-driven render), it pushes vNodeData in document order.
    // Otherwise (direct API usage or direct mode), tree-building handles the push.
    if (!this._cursorDrivenRender || this._directMode) {
      this.vNodeDatas.push(frame.vNodeData);
    }
  }
  private popFrame() {
    const closingFrame = this.ssrBuildState.currentElementFrame!;
    this.ssrBuildState.currentElementFrame = closingFrame.parent;
    return closingFrame;
  }

  ////////////////////////////////////
  write(text: string) {
    this.size += text.length;
    if (this._directMode) {
      this.writer.write(text);
    } else {
      // Tree-building mode: capture as raw HTML children of current element
      const parentSsrNode = this.ssrBuildState.currentElementFrame?.ssrNode;
      if (parentSsrNode) {
        ssrNode_addOrderedChild(parentSsrNode as SsrNode, {
          kind: SsrNodeKind.RawHtml,
          content: text,
        });
      }
    }
  }

  writeArray(array: string[], separator: string) {
    for (let i = 0; i < array.length; i++) {
      const element = array[i];
      if (i > 0) {
        this.write(separator);
      }
      this.write(element);
    }
  }

  /**
   * Process attrs: run side effects (signal tracking, event serialization, ref handling, innerHTML
   * detection) and return processed key/value pairs for walker serialization. Does NOT write any
   * HTML — that's the walker's job.
   */
  private processAttrs(
    tag: string,
    attrs: Props,
    isConst: boolean,
    styleScopedId: string | null,
    currentFile: string | null,
    hasMovedCaptures: boolean
  ): { processed: Record<string, any>; innerHTML: string | undefined } {
    const processed: Record<string, any> = {};
    let innerHTML: string | undefined = undefined;
    for (let key in attrs) {
      let value = attrs[key];
      if (isSSRUnsafeAttr(key)) {
        if (isDev) {
          throw qError(QError.unsafeAttr, [key]);
        }
        continue;
      }

      if (isHtmlAttributeAnEventName(key)) {
        value = _setEvent(this.serializationCtx, key, value, hasMovedCaptures);
      } else if (key === 'ref') {
        const lastNode = this.getOrCreateLastNode();
        if (isSignal(value)) {
          (value as SignalImpl<unknown>).$untrackedValue$ = new DomRef(lastNode);
          continue;
        } else if (typeof value === 'function') {
          value(new DomRef(lastNode));
          continue;
        } else if (value == null) {
          continue;
        } else {
          throw qError(QError.invalidRefValue, [currentFile]);
        }
      } else if (key === ITERATION_ITEM_SINGLE || key === ITERATION_ITEM_MULTI) {
        value = this.serializationCtx.$addRoot$(value);
      } else if (isSignal(value)) {
        const lastNode = this.getOrCreateLastNode();
        const signalData = new SubscriptionData({
          $scopedStyleIdPrefix$: styleScopedId,
          $isConst$: isConst,
        });
        const signal = value as Signal<unknown>;
        value = retryOnPromise(() =>
          this.trackSignalValue(signal, lastNode as unknown as HostElement, key, signalData)
        ) as Promise<string>;
      }
      if (isPromise<string | boolean | null>(value)) {
        const lastNode = this.getOrCreateLastNode();
        this.addPromiseAttribute(value);
        value.then((resolvedValue) => {
          this.addBackpatchEntry(lastNode.id, key, resolvedValue);
        });
        continue;
      }
      if (key === dangerouslySetInnerHTML) {
        if (value) {
          innerHTML = String(value);
          key = QContainerAttr;
          value = QContainerValue.HTML;
        }
        // we can skip this attribute for a style node
        // because we skip materializing the style node
        if (tag === 'style') {
          continue;
        }
      } else if (isPreventDefault(key)) {
        addPreventDefaultEventToSerializationContext(this.serializationCtx, key);
      }
      if (tag === 'textarea' && key === 'value') {
        if (value && typeof value !== 'string') {
          if (isDev) {
            throw qError(QError.wrongTextareaValue, [currentFile, value]);
          }
          continue;
        }
        innerHTML = escapeHTML((value as string) || '');
        key = QContainerAttr;
        value = QContainerValue.TEXT;
      }

      processed[key] = value;
    }
    return { processed, innerHTML };
  }

  /**
   * Write attrs directly to the stream (used in _directMode for container data script tags). Simple
   * attrs only — no signals, events, or complex processing.
   */
  private writeAttrsDirect(attrs: Props | null) {
    if (!attrs) {
      return;
    }
    for (const key in attrs) {
      let value = attrs[key];
      // Event attributes (q-e:, q-d:, on:) need special handling to serialize QRLs
      if (isHtmlAttributeAnEventName(key)) {
        value = _setEvent(this.serializationCtx, key, value, false);
      }
      const serializedValue = serializeAttribute(key, value, null);
      if (serializedValue != null && serializedValue !== false) {
        this.writer.write(SPACE);
        this.writer.write(key);
        if (serializedValue !== true) {
          this.writer.write(ATTR_EQUALS_QUOTE);
          this.writer.write(escapeHTML(String(serializedValue)));
          this.writer.write(QUOTE);
        }
      }
    }
  }

  private addPromiseAttribute(promise: Promise<any>) {
    this.promiseAttributes ||= [];
    this.promiseAttributes.push(promise);
  }

  private async resolvePromiseAttributes() {
    if (this.promiseAttributes) {
      await Promise.all(this.promiseAttributes);
      this.promiseAttributes = null;
    }
  }

  /**
   * Emit OoO (out-of-order) chunks for all Suspense boundaries. Each chunk contains:
   *
   * 1. A `<template>` with the actual content HTML
   * 2. A `<script>` that swaps the placeholder with the content
   */
  private emitOoOChunks(boundaries: SuspenseBoundary[] = this.suspenseBoundaries) {
    for (const boundary of boundaries) {
      const placeholderId = boundary.placeholderId;
      const templateId = `qooo-${placeholderId}`;

      // Emit <template id="qooo-qph-N"> with actual content
      this.writer.write(`<template id="${templateId}">`);
      // Emit content HTML using a mini streaming walker
      const contentWalker = new SsrStreamingWalker({
        writer: this.writer,
      });
      // emitChildren walks orderedChildren — synchronous for already-built trees
      const emitResult = contentWalker.emitTree(boundary.contentNode);
      if (isPromise(emitResult)) {
        // Shouldn't happen for already-built trees, but handle gracefully
        throw new Error('Unexpected async in OoO content emission');
      }
      this.writer.write('</template>');

      // Emit swap script
      const nonce = this.renderOptions.serverData?.nonce;
      const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
      this.writer.write(
        `<script${nonceAttr}>(function(){` +
          `var t=document.getElementById("${templateId}");` +
          `var p=document.getElementById("${placeholderId}");` +
          `if(t&&p){p.replaceWith(t.content);t.remove()}` +
          `})()</script>`
      );
    }
  }

  private markSuspenseFallbackEmitted(node: ISsrNode) {
    const boundary = this.suspenseBoundaries.find((candidate) => candidate.node === node);
    if (boundary) {
      boundary.fallbackEmitted = true;
    }
  }

  private async waitForSuspenseProgressOrDeadline(deadline: number | null) {
    const waitMs = deadline == null ? 0 : Math.max(0, deadline - performance.now());
    if (this.$renderPromise$) {
      if (waitMs > 0) {
        await Promise.race([
          this.$renderPromise$,
          new Promise<void>((resolve) => {
            setTimeout(resolve, waitMs);
          }),
        ]);
      } else {
        await this.$renderPromise$;
      }
      return;
    }
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }
  }
}

const isQwikStyleElement = (tag: string, attrs: Props | null) => {
  if (tag === 'style' && attrs != null) {
    return (
      Object.prototype.hasOwnProperty.call(attrs, QStyle) ||
      Object.prototype.hasOwnProperty.call(attrs, QScopedStyle)
    );
  }
  return false;
};

function newTagError(text: string) {
  return qError(QError.tagError, [text]);
}

function hasDestroy(obj: any): obj is { $destroy$(): void } {
  return obj && typeof obj === 'object' && typeof obj.$destroy$ === 'function';
}

// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
function isSSRUnsafeAttr(name: string): boolean {
  for (let idx = 0; idx < name.length; idx++) {
    const ch = name.charCodeAt(idx);
    if (
      ch === 62 /* > */ ||
      ch === 47 /* / */ ||
      ch === 61 /* = */ ||
      ch === 34 /* " */ ||
      ch === 39 /* ' */ ||
      ch === 9 /* \t */ ||
      ch === 10 /* \n */ ||
      ch === 12 /* \f */ ||
      ch === 32 /* space */
    ) {
      return true;
    }
  }
  return false;
}

function randomStr() {
  return (Math.random().toString(36) + '000000').slice(2, 8);
}

function addPreventDefaultEventToSerializationContext(
  serializationCtx: SerializationContext,
  key: string
) {
  // skip the `preventdefault`, leave the ':'
  const eventName = 'e' + key.substring(14);
  if (eventName) {
    serializationCtx.$eventNames$.add(eventName);
  }
}
