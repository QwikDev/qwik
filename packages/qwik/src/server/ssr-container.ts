/** @file Public APIs for the SSR */
import { isDev } from '@qwik.dev/core/build';
import {
  _SubscriptionData as SubscriptionData,
  _SharedContainer,
  _jsxSorted,
  _jsxSplit,
  _res,
  _setEvent,
  _walkJSX,
  _createQRL as createQRL,
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
  QStatePatchAttr,
  QStyle,
  QSuspenseResolved,
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
  encodeVNodeDataKey,
  encodeVNodeDataString,
  escapeHTML,
  getSegmentVNodeRefId,
  isHtmlAttributeAnEventName,
  isObjectEmpty,
  isPreventDefault,
  isPromise,
  mapArray_get,
  mapArray_has,
  mapArray_set,
  maybeThen,
  qError,
  qTest,
  retryOnPromise,
  serializeAttribute,
} from './qwik-copy';
import {
  type ContextId,
  type HostElement,
  type InnerContainer,
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
  type SSRInternalStreamWriter,
  type SSROutOfOrderSegment,
  type SSRRenderJSXOptions,
  type SSRSegmentContainer as ISSRSegmentContainer,
  type SSRWriteChunk,
  type SymbolToChunkResolver,
  type ValueOrPromise,
  type EffectSubscription,
} from './qwik-types';

import {
  collectSubscriptionPatches,
  recordExternalRootEffect,
  type SubscriptionPatchRecord,
} from './ooos-utils';
import { preloaderPost, preloaderPre } from './preload-impl';
import {
  getQwikBackpatchExecutorScript,
  getQwikLoaderScript,
  getQwikOutOfOrderExecutorScript,
} from './scripts';
import { DomRef, SsrComponentFrame, SsrNode } from './ssr-node';
import { Q_FUNCS_PREFIX } from './ssr-render';
import { renderSSRChunks, StringBufferSegmentWriter, StringSSRWriter } from './ssr-stream-writer';
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
  type RenderToStreamOptions,
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

enum QwikLoaderInclude {
  Module,
  Inline,
  Done,
}

const NO_SCRIPT_HERE_ELEMENTS = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'iframe',
  'noframes',
  'noscript',
  'xmp',
  'template',
  'svg',
  'math',
]);

export function ssrCreateContainer(opts: SSRRenderOptions): ISSRContainer {
  opts.renderOptions ||= {};
  return new SSRContainer({
    tagName: opts.tagName || 'div',
    writer: opts.writer || new StringSSRWriter(),
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
  refBase: number | string | null;
}

const noopStreamHandler: IStreamHandler = {
  flush() {},
  waitForPendingFlush() {},
  streamBlockStart() {},
  streamBlockEnd() {},
};

/**
 * Stores sequential sequence arrays, which in turn store Tasks which have cleanup functions which
 * need to be executed at the end of SSR.
 */
export type CleanupQueue = any[][];

const QTemplateProps = {
  hidden: true,
  'aria-hidden': true,
};

export const enum SSRContainerState {
  NotReady = 0,
  DataStreamStarted = 1,
  OOOSReady = 2,
}

const enum OutOfOrderSegmentState {
  Rendering = 0,
  EarlyFinalized = 1,
  Done = 2,
}

type VNodeDataOwner = string | undefined;
type PendingVNodeDataPatches = Map<VNodeDataOwner, Map<number, VNodeData>>;
type VNodeDataSerializableNode = Pick<ISsrNode, 'id' | 'vnodeData'>;

class SSRContainer extends _SharedContainer implements ISSRContainer {
  public tag: string;
  public isHtml: boolean;
  public writer: SSRInternalStreamWriter;
  public streamHandler: IStreamHandler;
  public timing: RenderToStreamResult['timing'];
  public size = 0;
  public resolvedManifest: ResolvedManifest;
  public symbolToChunkResolver: SymbolToChunkResolver;
  public renderOptions: RenderOptions;
  public readonly outOfOrderStreaming: boolean;
  public serializationCtx: SerializationContext;
  // Sometimes there is no app state, but framework metadata still points to a vnode id.
  // For example, an OOOS segment can point outside the segment to a root vnode through
  // q:sparent, so root vnode data must still be emitted for the client ref table.
  private hasVNodeRefsForSerialization = false;
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

  private lastNode: ISsrNode | null = null;
  private currentComponentNode: ISsrNode | null = null;
  private styleIds = new Set<string>();
  private isBackpatchExecutorEmitted = false;
  private isOutOfOrderExecutorEmitted = false;
  private backpatchMap = new Map<number | string, BackpatchEntry[]>();

  private currentElementFrame: ElementFrame | null = null;

  private renderTimer: ReturnType<typeof createTimer>;
  /**
   * Current element index.
   *
   * This number must match the depth-first traversal of the DOM elements as returned by the
   * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  private depthFirstElementCount: number = -1;
  protected vNodeDatas: VNodeData[] = [];
  private vNodeDataOffset = 0;
  private componentStack: ISsrComponentFrame[] = [];
  private cleanupQueue: CleanupQueue = [];
  private emitContainerDataFrame: ElementFrame | null = null;
  public $instanceHash$ = randomStr();
  // Temporary flag to find missing roots after the state was serialized
  protected $noMoreRoots$ = false;
  private qlInclude: QwikLoaderInclude;
  private promiseAttributes: Array<Promise<any>> | null = null;
  protected vnodeSegment: string | null = null;
  private $containerState$ = SSRContainerState.NotReady;

  // OOOS related fields
  private outOfOrderId = 0;
  private outOfOrderUsed = false;
  private outOfOrderPendingSegments: Promise<void>[] = [];
  public outOfOrderSegments: SSRSegmentContainer[] = [];
  private rootContainerReadyPromise: Promise<void> | null = null;
  private resolveRootContainerReady: (() => void) | null = null;
  private renderQueue: Promise<unknown> = Promise.resolve();
  private emittedQwikEventNames = new Set<string>();
  public emittedSyncFnCount = 0;
  public rootContainerSerializedRootCount = 0;
  private emittedVNodeDataOwners: Set<VNodeDataOwner> | null = null;

  constructor(opts: SSRContainerOptions) {
    super(opts.renderOptions.serverData ?? {}, opts.locale);
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
    this.timing = opts.timing;
    this.$buildBase$ = opts.buildBase;
    this.resolvedManifest = opts.resolvedManifest;
    this.renderOptions = opts.renderOptions;
    const outOfOrderStreaming =
      (this.renderOptions as RenderToStreamOptions).streaming?.outOfOrder === true;
    if (!__EXPERIMENTAL__.suspense) {
      if (outOfOrderStreaming) {
        throw new Error(
          'Out-of-order Suspense streaming requires `experimental: ["suspense"]` in the `qwikVite` plugin.'
        );
      }
      this.outOfOrderStreaming = false;
    } else {
      this.outOfOrderStreaming = outOfOrderStreaming;
    }
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

  handleError(err: any, _$host$: null): void {
    throw err;
  }

  addBackpatchEntry(
    ssrNodeId: string,
    attrName: string,
    serializedValue: string | boolean | null
  ): void {
    // we want to always parse as decimal here
    const elementIndex = parseInt(ssrNodeId, 10);
    const entry: BackpatchEntry = {
      attrName,
      value: serializedValue,
    };
    const entries = this.backpatchMap.get(elementIndex) || [];
    entries.push(entry);
    this.backpatchMap.set(elementIndex, entries);
  }

  async render(jsx: JSXOutput) {
    this.openContainer();
    await this.renderJSX(jsx, {
      currentStyleScoped: null,
      parentComponentFrame: this.getComponentFrame(),
    });
    await this.closeContainer();
  }

  async renderJSX(jsx: JSXOutput, options: SSRRenderJSXOptions) {
    await _walkJSX(this, jsx, options);
  }

  $isReadyForOOOS$(): boolean {
    return this.$containerState$ === SSRContainerState.OOOSReady;
  }

  /** Queue OOOS serialization/write work that must not overlap with root state serialization. */
  $runQueuedRender$<T>(render: () => ValueOrPromise<T>): ValueOrPromise<T> {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming) {
      return render();
    }
    if (this.$containerState$ === SSRContainerState.NotReady) {
      return render();
    }
    const result =
      this.$containerState$ === SSRContainerState.DataStreamStarted
        ? this.renderQueue.then(() => this.$waitForRootContainerReady$()).then(render)
        : this.renderQueue.then(render);
    this.renderQueue = result.catch(() => {});
    return result;
  }

  private $waitForRootContainerReady$(): ValueOrPromise<void> {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming || this.$isReadyForOOOS$()) {
      return;
    }
    return (this.rootContainerReadyPromise ||= new Promise<void>((resolve) => {
      this.resolveRootContainerReady = resolve;
    }));
  }

  private $markRootContainerReady$(): void {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming || this.$isReadyForOOOS$()) {
      return;
    }
    this.rootContainerSerializedRootCount = this.serializationCtx.$roots$.length;
    this.$containerState$ = SSRContainerState.OOOSReady;
    this.resolveRootContainerReady?.();
    this.resolveRootContainerReady = null;
    this.rootContainerReadyPromise = null;
  }

  nextOutOfOrderId(): number {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming) {
      return 0;
    }
    this.outOfOrderUsed = true;
    return ++this.outOfOrderId;
  }

  emitOutOfOrderSegmentScripts(scripts: string): void {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming || !scripts) {
      return;
    }
    this.write(scripts);
  }

  async segment(
    segmentId: string,
    jsx: JSXOutput,
    options: SSRRenderJSXOptions
  ): Promise<SSROutOfOrderSegment> {
    if (!__EXPERIMENTAL__.suspense) {
      throw new Error(
        'Out-of-order Suspense streaming requires `experimental: ["suspense"]` in the `qwikVite` plugin.'
      );
    }
    if (!this.outOfOrderStreaming) {
      throw new Error(
        'Out-of-order Suspense streaming requires `streaming.outOfOrder` to be `true`.'
      );
    }
    this.markVNodeRefForSerialization(options.parentComponentFrame?.componentNode);
    const writer = new StringBufferSegmentWriter();
    const segmentContainer = this.createSegmentContainer(segmentId, writer);
    this.outOfOrderSegments.push(segmentContainer);
    try {
      await segmentContainer.renderJSX(jsx, options);
      await segmentContainer.resolvePromiseAttributes();
      const htmlChunks = writer.extract();
      return {
        container: segmentContainer,
        writer,
        htmlChunks,
      };
    } catch (error) {
      this.removeOutOfOrderSegment(segmentContainer);
      throw error;
    }
  }

  protected $getRootContainer$(): SSRContainer {
    let rootContainer: SSRContainer = this;
    while (rootContainer instanceof SSRSegmentContainer) {
      rootContainer = rootContainer.$rootContainer$;
    }
    return rootContainer;
  }

  private createSegmentContainer(
    segmentId: string,
    writer: StringBufferSegmentWriter
  ): SSRSegmentContainer {
    const rootContainer = this.$getRootContainer$();
    const contentHostNode = this.getOrCreateLastNode();
    this.addRoot(contentHostNode);
    this.markVNodeRefForSerialization(contentHostNode);
    const rootFrame: ElementFrame = {
      tagNesting: TagNesting.ANYTHING,
      parent: null,
      elementName: '#segment',
      depthFirstElementIdx: -1,
      // OOOS inserts this synthetic root under the Suspense content host on the client.
      vNodeData: [VNodeDataFlag.SERIALIZE],
      currentFile: null,
      refBase: contentHostNode.id,
    };
    const segmentContainer = new SSRSegmentContainer(
      {
        tagName: this.tag,
        writer,
        streamHandler: noopStreamHandler as SSRContainerOptions['streamHandler'],
        locale: this.$locale$,
        timing: this.timing,
        buildBase: this.$buildBase$ || '/build/',
        resolvedManifest: this.resolvedManifest,
        renderOptions: this.renderOptions,
      },
      rootContainer
    );

    const innerSegmentContainer = segmentContainer as typeof segmentContainer & InnerContainer;
    innerSegmentContainer.$isOutOfOrderSegment$ = true;
    innerSegmentContainer.$storeProxyMap$ = this.$storeProxyMap$;
    segmentContainer.serializationCtx = segmentContainer.serializationCtxFactory(
      SsrNode,
      DomRef,
      this.symbolToChunkResolver,
      writer
    );
    segmentContainer.serializationCtx.$addSyncFn$ = this.serializationCtx.$addSyncFn$.bind(
      this.serializationCtx
    );
    segmentContainer.currentElementFrame = rootFrame;
    segmentContainer.currentComponentNode = this.currentComponentNode;
    segmentContainer.depthFirstElementCount = 0;
    segmentContainer.vNodeDatas = [rootFrame.vNodeData];
    segmentContainer.componentStack = this.componentStack.slice();
    segmentContainer.vnodeSegment = segmentId;
    segmentContainer.styleIds = this.styleIds;
    segmentContainer.emittedQwikEventNames = this.emittedQwikEventNames;
    segmentContainer.qlInclude = QwikLoaderInclude.Done;
    segmentContainer.$instanceHash$ = this.$instanceHash$;
    innerSegmentContainer._didAddQwikLoader = true;
    return segmentContainer;
  }

  queueOutOfOrderSegment(segment: Promise<void>): void {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming) {
      return;
    }
    this.outOfOrderPendingSegments.push(segment);
  }

  removeOutOfOrderSegment(segment: SSRSegmentContainer): void {
    const segments = this.outOfOrderSegments;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === segment) {
        segments.splice(i, 1);
        return;
      }
    }
  }

  setContext<T>(host: HostElement, context: ContextId<T>, value: T): void {
    const ssrNode: ISsrNode = host as any;
    let ctx: Array<string | unknown> = ssrNode.getProp(QCtxAttr);
    if (ctx == null) {
      ssrNode.setProp(QCtxAttr, (ctx = []));
    }
    mapArray_set(ctx, context.id, value, 0, true);
    // Store the node which will store the context
    this.addRoot(ssrNode);
  }

  resolveContext<T>(host: HostElement, contextId: ContextId<T>): T | undefined {
    let ssrNode: ISsrNode | null = host as any;
    while (ssrNode) {
      const ctx: Array<string | unknown> = ssrNode.getProp(QCtxAttr);
      if (ctx != null && mapArray_has(ctx, contextId.id, 0)) {
        return mapArray_get(ctx, contextId.id, 0) as T;
      }
      ssrNode = ssrNode.parentComponent;
    }
    return undefined;
  }

  getParentHost(host: HostElement): HostElement | null {
    const ssrNode: ISsrNode = host as any;
    return ssrNode.parentComponent as ISsrNode | null;
  }

  setHostProp<T>(host: ISsrNode, name: string, value: T): void {
    const ssrNode: ISsrNode = host as any;
    return ssrNode.setProp(name, value);
  }

  getHostProp<T>(host: ISsrNode, name: string): T | null {
    const ssrNode: ISsrNode = host as any;
    return ssrNode.getProp(name);
  }

  /**
   * Renders opening tag for container. It could be a html tag for regular apps or custom element
   * for micro-frontends
   */
  openContainer() {
    if (this.tag == 'html') {
      this.write('<!DOCTYPE html>');
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
      this.emitContainerDataFrame = this.currentElementFrame;
    }
  }

  /** Renders closing tag for current container */
  closeContainer(): ValueOrPromise<void> {
    return this.closeElement();
  }

  $noScriptHere$: number = 0;

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
    // keep track of parser states/contexts where inline scripts are not safe to emit.
    // Non-element tokenizer states are already safe because emission only happens before opening
    // a new element, never while serializing a tag, attribute, comment, or CDATA section.
    if (NO_SCRIPT_HERE_ELEMENTS.has(elementName)) {
      this.$noScriptHere$++;
    }
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
    }

    let innerHTML: string | undefined = undefined;
    this.lastNode = null;
    if (!isQwikStyle && this.currentElementFrame) {
      vNodeData_incrementElementCount(this.currentElementFrame.vNodeData);
    }

    this.createAndPushFrame(elementName, this.depthFirstElementCount++, currentFile);
    if (this.isHtml && elementName === 'body' && this.emitContainerDataFrame === null) {
      // For full document rendering emit before closing </body>.
      this.emitContainerDataFrame = this.currentElementFrame;
    }
    vNodeData_openElement(this.currentElementFrame!.vNodeData);
    this.write(LT);
    this.write(elementName);
    // create here for writeAttrs method to use it
    const lastNode = this.getOrCreateLastNode();
    if (varAttrs) {
      innerHTML = this.writeAttrs(
        elementName,
        varAttrs,
        false,
        styleScopedId,
        currentFile,
        hasMovedCaptures
      );
    }
    this.write(' ' + Q_PROPS_SEPARATOR);
    if (key !== null) {
      this.write(`="${key}"`);
    } else if (qTest) {
      // Domino sometimes does not like empty attributes, so we need to add a empty value
      this.write(EMPTY_ATTR);
    }
    if (constAttrs && !isObjectEmpty(constAttrs)) {
      innerHTML =
        this.writeAttrs(
          elementName,
          constAttrs,
          true,
          styleScopedId,
          currentFile,
          hasMovedCaptures
        ) || innerHTML;
    }
    this.write(GT);

    if (lastNode) {
      lastNode.setTreeNonUpdatable();
    }
    return innerHTML;
  }

  /** Renders closing tag for DOM element */
  closeElement(): ValueOrPromise<void> {
    if (this.currentElementFrame === this.emitContainerDataFrame) {
      this.emitContainerDataFrame = null;
      // start snapshot timer
      this.onRenderDone();
      const snapshotTimer = createTimer();
      return maybeThen(
        maybeThen(this.emitContainerData(), () => this._closeElement()),
        () => {
          // set snapshot time
          this.timing.snapshot = snapshotTimer();
        }
      );
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
  protected drainCleanupQueue() {
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
    if (!isSelfClosingTag(elementName)) {
      this.write(CLOSE_TAG);
      this.write(elementName);
      this.write(GT);
    }
    this.lastNode = null;
    // keep track of where to emit scripts
    if (NO_SCRIPT_HERE_ELEMENTS.has(elementName)) {
      this.$noScriptHere$--;
    }
  }

  /** Writes opening data to vNodeData for fragment boundaries */
  openFragment(attrs: Props) {
    this.lastNode = null;
    vNodeData_openFragment(this.currentElementFrame!.vNodeData, attrs);
    // create SSRNode and add it as component child to serialize its vnode data
    this.getOrCreateLastNode();
  }

  /** Writes closing data to vNodeData for fragment boundaries */
  closeFragment() {
    vNodeData_closeFragment(this.currentElementFrame!.vNodeData);

    if (this.currentComponentNode) {
      this.currentComponentNode.setTreeNonUpdatable();
    }
    this.lastNode = null;
  }

  openProjection(attrs: Props) {
    this.openFragment(attrs);
    const componentFrame = this.getComponentFrame();
    if (componentFrame) {
      const projectionNode = this.getOrCreateLastNode();
      this.markVNodeRefForSerialization(projectionNode);
      // TODO: we should probably serialize only projection VNode
      if (!this.vnodeSegment) {
        this.addRoot(componentFrame.componentNode);
      } else {
        this.markVNodeRefForSerialization(componentFrame.componentNode);
      }
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

  /** Writes opening data to vNodeData for component boundaries */
  openComponent(attrs: Props) {
    this.openFragment(attrs);
    this.currentComponentNode = this.getOrCreateLastNode();
    this.componentStack.push(new SsrComponentFrame(this.currentComponentNode));
  }

  /**
   * Returns the current component frame.
   *
   * @param projectionDepth - How many levels of projection to skip. This is needed when projections
   *   are nested inside other projections we need to have a way to read from a frame above.
   * @returns
   */
  getComponentFrame(projectionDepth: number = 0): ISsrComponentFrame | null {
    const length = this.componentStack.length;
    const idx = length - projectionDepth - 1;
    return idx >= 0 ? this.componentStack[idx] : null;
  }

  getParentComponentFrame(): ISsrComponentFrame | null {
    const localProjectionDepth = this.getComponentFrame()?.projectionDepth || 0;
    return this.getComponentFrame(localProjectionDepth);
  }

  /** Writes closing data to vNodeData for component boundaries and emit unclaimed projections inline */
  async closeComponent() {
    const componentFrame = this.componentStack.pop()!;
    await this.emitUnclaimedProjectionForComponent(componentFrame);
    this.closeFragment();
    this.currentComponentNode = this.currentComponentNode?.parentComponent || null;
  }

  private async emitUnclaimedProjectionForComponent(
    componentFrame: ISsrComponentFrame
  ): Promise<void> {
    if (componentFrame.slots.length === 0) {
      return;
    }

    this.openElement(QTemplate, null, QTemplateProps, null);

    const scopedStyleId = componentFrame.projectionScopedStyle;
    for (let i = 0; i < componentFrame.slots.length; i += 2) {
      const slotName = componentFrame.slots[i] as string;
      const children = componentFrame.slots[i + 1] as JSXOutput;

      if (this.vnodeSegment) {
        this.markVNodeRefForSerialization(componentFrame.componentNode);
      }
      this.openFragment(
        isDev
          ? { [DEBUG_TYPE]: VirtualType.Projection, [QSlotParent]: componentFrame.componentNode.id }
          : { [QSlotParent]: componentFrame.componentNode.id }
      );
      const lastNode = this.getOrCreateLastNode();
      lastNode.vnodeData[0] |= VNodeDataFlag.SERIALIZE;
      componentFrame.componentNode.setProp(slotName, lastNode.id);
      // Use projectionComponentFrame so that Slots can find their projections from the correct parent
      await this.renderJSX(children, {
        currentStyleScoped: scopedStyleId,
        parentComponentFrame: componentFrame.projectionComponentFrame,
      });
      this.closeFragment();
    }

    this.closeElement();
  }

  /** Write a text node with correct escaping. Save the length of the text node in the vNodeData. */
  textNode(text: string) {
    this.write(escapeHTML(text));
    vNodeData_addTextSize(this.currentElementFrame!.vNodeData, text.length);
    this.lastNode = null;
  }

  htmlNode(rawHtml: string) {
    this.write(rawHtml);
  }

  commentNode(text: string) {
    this.write('<!--' + text + '-->');
  }

  addRoot(obj: unknown) {
    if (this.$noMoreRoots$) {
      const rootId = this.serializationCtx.$hasRootId$(obj);
      return rootId;
    }
    return this.serializationCtx.$addRoot$(obj);
  }

  getOrCreateLastNode(): ISsrNode {
    if (!this.lastNode) {
      const currentFrame = this.currentElementFrame!;
      const elementIndex = currentFrame.depthFirstElementIdx + 1;
      const refBase =
        currentFrame.refBase ??
        (this.vnodeSegment
          ? getSegmentVNodeRefId(this.vnodeSegment, elementIndex)
          : elementIndex + this.vNodeDataOffset);
      this.lastNode = vNodeData_createSsrNodeReference(
        this.currentComponentNode,
        currentFrame.vNodeData,
        refBase,
        this.cleanupQueue,
        currentFrame.currentFile
      );
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

  $appendStyle$(content: string, styleId: string, host: ISsrNode, scoped: boolean): void {
    if (scoped) {
      const componentFrame = this.getComponentFrame(0)!;
      componentFrame.scopedStyleIds.add(styleId);
      const scopedStyleIds = convertStyleIdsToString(componentFrame.scopedStyleIds);
      this.setHostProp(host, QScopedStyle, scopedStyleIds);
    }

    if (!this.styleIds.has(styleId)) {
      this.styleIds.add(styleId);
      if (this.currentElementFrame?.elementName === 'html') {
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

  private _styleNode(styleId: string, content: string) {
    this.openElement('style', null, {
      [QStyle]: styleId,
    });
    this.write(content);
    this.closeElement();
  }

  ////////////////////////////////////

  private emitContainerData(): ValueOrPromise<void> {
    const isStreamingDisabled =
      (this.renderOptions as RenderToStreamOptions).streaming?.inOrder?.strategy === 'disabled';
    const shouldFlushShell =
      !isStreamingDisabled ||
      (__EXPERIMENTAL__.suspense && this.outOfOrderStreaming && this.outOfOrderUsed);
    // TODO first emit state, then only emit slots where the parent is serialized (so they could rerender)
    return maybeThen(
      maybeThen(shouldFlushShell ? this.streamHandler.flush() : undefined, () =>
        this.resolvePromiseAttributes()
      ),
      () => {
        this.$containerState$ = SSRContainerState.DataStreamStarted;
        return maybeThen(this.emitStateData(), () => {
          this.$noMoreRoots$ = true;
          return maybeThen(this.emitRestStateData(), () => this.emitOutOfOrderSegmentsAndData());
        });
      }
    );
  }

  private emitRestStateData(): void {
    this.emitVNodeData();
    this.emitDelayedOutOfOrderSegmentVNodeData();
    if (!isDev) {
      preloaderPost(this, this.renderOptions, this.$serverData$?.nonce);
    }
    this.emitSyncFnsData();
    this.emitPatchDataIfNeeded();
    this.emitExecutorIfNeeded();
    this.emitQwikLoaderAtBottomIfNeeded();
  }

  private emitDelayedOutOfOrderSegmentVNodeData(): void {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming || !this.outOfOrderUsed) {
      return;
    }
    for (let i = 0; i < this.outOfOrderSegments.length; i++) {
      const segment = this.outOfOrderSegments[i];
      if (segment.$outOfOrderState$ === OutOfOrderSegmentState.EarlyFinalized) {
        segment.$emitDelayedOutOfOrderVNodeData$();
        i--;
      }
    }
  }

  private emitOutOfOrderSegmentsAndData(): ValueOrPromise<void> {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming || !this.outOfOrderUsed) {
      return;
    }
    this.emitOutOfOrderExecutorIfNeeded();

    return maybeThen(this.streamHandler.flush(), async () => {
      this.$markRootContainerReady$();
      if (this.outOfOrderPendingSegments.length) {
        await Promise.all(this.outOfOrderPendingSegments);
      }
    });
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
  emitVNodeData(segmentId?: string) {
    this.$getRootContainer$().markVNodeDataOwnerEmitted(segmentId);
    if (!segmentId && !this.serializationCtx.$roots$.length && !this.hasVNodeRefsForSerialization) {
      return;
    }
    this.emitVNodeDataScript(segmentId, this.vNodeDatas.entries());
  }

  protected emitVNodeDataScript(
    segmentId: string | undefined,
    entries: Iterable<[number, VNodeData]>,
    patch = false
  ) {
    const attrs: Props = { type: 'qwik/vnode' };
    if (__EXPERIMENTAL__.suspense && this.outOfOrderStreaming && segmentId) {
      attrs[QSuspenseResolved] = segmentId;
    }
    if (patch) {
      attrs[QStatePatchAttr] = true;
    }
    this.openScript(attrs);
    const vNodeAttrsStack: Props[] = [];
    let lastSerializedIdx = 0;

    // eslint-disable-next-line qwik-local/loop-style -- we want to keep the for..of loop for better readability here
    for (const [elementIdx, vNode] of entries) {
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
    this.closeScript();
    if (patch && !segmentId) {
      this.emitInlineScript(
        'document.qProcessVNodeDataPatch&&document.qProcessVNodeDataPatch(document.currentScript.previousElementSibling)'
      );
    }
  }

  private markVNodeRefForSerialization(node: ISsrNode | null | undefined): void {
    if (node) {
      this.hasVNodeRefsForSerialization = true;
      node.vnodeData[0] |= VNodeDataFlag.SERIALIZE | VNodeDataFlag.REFERENCE;
    }
  }

  private markVNodeDataOwnerEmitted(segmentId?: string): void {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming) {
      return;
    }
    (this.emittedVNodeDataOwners ||= new Set()).add(segmentId);
  }

  isVNodeDataOwnerEmitted(owner: VNodeDataOwner): boolean {
    return this.emittedVNodeDataOwners?.has(owner) === true;
  }

  protected getVNodeDataOwnerFromNodeId(id: string): { owner: VNodeDataOwner; localIndex: number } {
    const refBase = parseInt(id, 10);
    if (refBase >= 0) {
      return { owner: undefined, localIndex: refBase };
    }
    const pair = -refBase - 1;
    const diagonal = Math.floor((Math.sqrt(8 * pair + 1) - 1) / 2);
    const diagonalStart = (diagonal * (diagonal + 1)) / 2;
    const localIndex = pair - diagonalStart;
    const segmentIndex = diagonal - localIndex;
    return { owner: String(segmentIndex + 1), localIndex };
  }

  private writeFragmentAttrs(fragmentAttrs: Props): void {
    for (const key in fragmentAttrs) {
      const rawValue = fragmentAttrs[key];
      let value = rawValue as string;
      let rootId: number | string | undefined;
      let encodeValue: ((value: string) => string) | null = null;
      if (key === ELEMENT_ID && typeof rawValue === 'number') {
        rootId = rawValue;
        value = String(rawValue);
      } else if (typeof rawValue !== 'string') {
        rootId = this.addRoot(rawValue);
        // We didn't add the vnode data, so we are only interested in the vnode position
        if (rootId === undefined) {
          continue;
        }
        value = String(rootId);
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
          encodeValue = encodeVNodeDataKey;
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
          encodeValue = encodeURI;
          this.write(VNodeDataChar.SEPARATOR_CHAR);
          this.write(encodeVNodeDataString(key));
          this.write(VNodeDataChar.SEPARATOR_CHAR);
        }
      }
      const encodedValue = encodeVNodeDataString(encodeValue ? encodeValue(value) : value);
      const isEncoded = encodeValue ? encodedValue !== value : false;
      if (isEncoded) {
        // add separator only before and after the encoded value
        this.write(VNodeDataChar.SEPARATOR_CHAR);
        this.write(encodedValue);
        this.write(VNodeDataChar.SEPARATOR_CHAR);
      } else if (typeof rootId === 'number') {
        this.writeRootRef(rootId);
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

    this.openScript(attrs);
    this.serializationCtx.$setWriter$(this.writer);
    return maybeThen(this.serializationCtx.$serialize$(), () => {
      this.closeScript();
    });
  }

  /** Add q-d:qidle attribute to eagerly resume some state if needed */
  protected stateScriptAttrs(): Props {
    const attrs: Props = { type: 'qwik/state', [QInstanceAttr]: this.$instanceHash$ };
    const eagerResume = this.serializationCtx.$eagerResume$;
    if (eagerResume.size > 0) {
      attrs['q-d:qidle'] = createQRL(null, '_res', _res, null, [...eagerResume]);
    }
    return attrs;
  }

  protected emitSyncFnsData(append = false) {
    const fns = this.serializationCtx.$syncFns$;
    const start = append ? this.emittedSyncFnCount : 0;
    if (fns.length > start) {
      const scriptAttrs: Record<string, string> = { 'q:func': 'qwik/json' };
      if (this.renderOptions.serverData?.nonce) {
        scriptAttrs['nonce'] = this.renderOptions.serverData.nonce;
      }
      this.openScript(scriptAttrs);
      if (append) {
        const qFuncsExpr = Q_FUNCS_PREFIX.replace('HASH', this.$instanceHash$).slice(0, -1);
        this.write(`(${qFuncsExpr}||(${qFuncsExpr}=[])).push(`);
      } else {
        this.write(Q_FUNCS_PREFIX.replace('HASH', this.$instanceHash$));
      }
      if (!append) {
        this.write(BRACKET_OPEN);
      }
      this.writeArray(append ? fns.slice(start) : fns, COMMA);
      if (!append) {
        this.write(BRACKET_CLOSE);
      }
      if (append) {
        this.write(')');
      }
      this.closeScript();
      this.emittedSyncFnCount = fns.length;
    }
  }

  emitPatchDataIfNeeded(): void {
    const patches: (string | number | boolean | null)[] = [];
    for (const [elementIndex, backpatchEntries] of this.backpatchMap) {
      for (let i = 0; i < backpatchEntries.length; i++) {
        const backpatchEntry = backpatchEntries[i];
        patches.push(
          elementIndex,
          backpatchEntry.attrName,
          isSignal(backpatchEntry.value)
            ? (backpatchEntry.value as unknown as SignalImpl<string>).untrackedValue
            : (backpatchEntry.value as string)
        );
      }
    }

    this.backpatchMap.clear();

    if (patches.length > 0) {
      this.isBackpatchExecutorEmitted = true;
      const scriptAttrs: Record<string, string> = { type: ELEMENT_BACKPATCH_DATA };
      if (this.renderOptions.serverData?.nonce) {
        scriptAttrs['nonce'] = this.renderOptions.serverData.nonce;
      }
      this.writeScript(scriptAttrs, JSON.stringify(patches));
    }
  }

  emitBackpatchDataAndExecutorIfNeeded(): void {
    if (this.backpatchMap.size === 0) {
      return;
    }
    this.emitPatchDataIfNeeded();
    this.emitExecutorIfNeeded();
  }

  private emitExecutorIfNeeded(): void {
    if (!this.isBackpatchExecutorEmitted) {
      return;
    }
    this.isBackpatchExecutorEmitted = false;

    const scriptAttrs: Record<string, string> = { type: 'text/javascript' };
    if (this.renderOptions.serverData?.nonce) {
      scriptAttrs['nonce'] = this.renderOptions.serverData.nonce;
    }

    const backpatchScript = getQwikBackpatchExecutorScript({ debug: isDev });
    this.writeScript(scriptAttrs, backpatchScript);
  }

  emitOutOfOrderExecutorIfNeeded(): void {
    if (
      !__EXPERIMENTAL__.suspense ||
      !this.outOfOrderStreaming ||
      !this.outOfOrderUsed ||
      this.isOutOfOrderExecutorEmitted
    ) {
      return;
    }
    this.isOutOfOrderExecutorEmitted = true;
    this.writeScript(
      { type: 'text/javascript', nonce: this.renderOptions.serverData?.nonce },
      getQwikOutOfOrderExecutorScript({ debug: isDev })
    );
  }

  emitInlineScript(script: string): void {
    const scriptAttrs: Record<string, string> = { type: 'text/javascript' };
    if (this.renderOptions.serverData?.nonce) {
      scriptAttrs['nonce'] = this.renderOptions.serverData.nonce;
    }
    this.writeScript(scriptAttrs, script);
  }

  writeScript(attrs: Props, body?: string): void {
    this.openScript(attrs);
    if (body) {
      this.write(body);
    }
    this.closeScript();
  }

  protected openScript(attrs: Props): void {
    this.write('<script');
    this.writeAttrs('script', attrs, true, null, null, true);
    this.write(GT);
  }

  protected closeScript(): void {
    this.write('</script>');
  }

  emitPreloaderPre() {
    if (!isDev) {
      preloaderPre(this, this.renderOptions.preloader, this.renderOptions.serverData?.nonce);
    }
  }

  isStatic(): boolean {
    return (
      !(__EXPERIMENTAL__.suspense && this.outOfOrderStreaming && this.outOfOrderUsed) &&
      this.serializationCtx.$eventQrls$.size === 0
    );
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
      this.writeScript(scriptAttrs);
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
    this.writeScript(scriptAttrs, qwikLoaderScript);
  }

  private emitQwikLoaderAtBottomIfNeeded() {
    if (!this.isStatic()) {
      if (this.qlInclude !== QwikLoaderInclude.Done) {
        this.emitQwikLoaderInline();
      }
      // emit the used events so the loader can subscribe to them
      this.emitNewQwikEvents();
    }
  }

  protected emitNewQwikEvents() {
    const eventNames: string[] = [];
    for (const eventName of this.serializationCtx.$eventNames$) {
      if (!this.emittedQwikEventNames.has(eventName)) {
        this.emittedQwikEventNames.add(eventName);
        eventNames.push(JSON.stringify(eventName));
      }
    }
    this.emitQwikEvents(eventNames);
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
      this.openScript(scriptAttrs);
      this.write(`(window._qwikEv||(window._qwikEv=[])).push(`);
      this.writeArray(eventNames, COMMA);
      this.write(PAREN_CLOSE);
      this.closeScript();
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
    if (isDev) {
      if (!this.currentElementFrame) {
        tagNesting = initialTag(elementName);
      } else {
        let frame: ElementFrame | null = this.currentElementFrame;
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
          for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
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
          throw newTagError(text.map(escapeHTML).join('\n'));
        }
      }
    }
    const frame: ElementFrame = {
      tagNesting,
      parent: this.currentElementFrame,
      elementName,
      depthFirstElementIdx,
      vNodeData: [VNodeDataFlag.NONE],
      currentFile: isDev ? currentFile || null : null,
      refBase: null,
    };
    this.currentElementFrame = frame;
    this.vNodeDatas.push(frame.vNodeData);
  }
  private popFrame() {
    const closingFrame = this.currentElementFrame!;
    this.currentElementFrame = closingFrame.parent;
    return closingFrame;
  }

  ////////////////////////////////////
  write(text: string) {
    this.size += text.length;
    this.writer.write(text);
  }

  writeRootRef(id: number) {
    this.size += String(id).length;
    this.writer.writeRootRef(id);
  }

  writeRootRefPath(path: number[]) {
    this.size += String(path[0]).length;
    this.writer.writeRootRefPath(path);
    for (let i = 1; i < path.length; i++) {
      this.size += 1 + String(path[i]).length;
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

  private writeAttrs(
    tag: string,
    attrs: Props,
    isConst: boolean,
    styleScopedId: string | null,
    currentFile: string | null,
    hasMovedCaptures: boolean
  ): string | undefined {
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
        const rootId = this.addRoot(value);
        if (rootId === undefined) {
          continue;
        }
        value = typeof rootId === 'number' ? [rootId] : String(rootId);
      } else if (isSignal(value)) {
        const lastNode = this.getOrCreateLastNode();
        const signalData = new SubscriptionData({
          $scopedStyleIdPrefix$: styleScopedId,
          $isConst$: isConst,
        });
        const signal = value as Signal<unknown>;
        value = retryOnPromise(() =>
          this.trackSignalValue(signal, lastNode, key, signalData)
        ) as Promise<string>;
      }
      if (isPromise<string | boolean | null>(value)) {
        const lastNode = this.getOrCreateLastNode();
        this.addPromiseAttribute(value);
        value.then((resolvedValue) => {
          this.addBackpatchEntry(
            lastNode.id,
            key,
            serializeAttribute(key, resolvedValue, styleScopedId)
          );
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

      const serializedValue = serializeAttribute(key, value, styleScopedId);
      if (serializedValue != null && serializedValue !== false) {
        this.write(SPACE);
        this.write(key);
        if (serializedValue !== true) {
          this.write(ATTR_EQUALS_QUOTE);
          if (Array.isArray(serializedValue)) {
            this.writeEscapedChunks(serializedValue as SSRWriteChunk[]);
          } else {
            const strValue = escapeHTML(String(serializedValue));
            this.write(strValue);
          }
          this.write(QUOTE);
        }
      }
    }
    return innerHTML;
  }

  private writeEscapedChunks(chunks: SSRWriteChunk[]): void {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (typeof chunk === 'string') {
        this.write(escapeHTML(chunk));
      } else if (typeof chunk === 'number') {
        this.writeRootRef(chunk);
      } else {
        this.writeRootRefPath(chunk.path);
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
}

interface SegmentRootCommit {
  rootIdMap: number[];
  newRootStart: number;
  newRootLocalIds: number[];
}

export class SSRSegmentContainer extends SSRContainer implements ISSRSegmentContainer {
  $outOfOrderState$ = OutOfOrderSegmentState.Rendering;
  $outOfOrderRootIdMap$: number[] | null = null;
  private subscriptionPatchRecords: SubscriptionPatchRecord[] = [];
  private pendingVNodeDataPatches: PendingVNodeDataPatches | null = null;

  constructor(
    opts: SSRContainerOptions,
    public override $rootContainer$: SSRContainer
  ) {
    super(opts);
  }

  override nextOutOfOrderId(): number {
    return this.$rootContainer$.nextOutOfOrderId();
  }

  override $runQueuedRender$<T>(render: () => ValueOrPromise<T>): ValueOrPromise<T> {
    return this.$rootContainer$.$runQueuedRender$(render);
  }

  override queueOutOfOrderSegment(segment: Promise<void>): void {
    this.$rootContainer$.queueOutOfOrderSegment(segment);
  }

  override emitOutOfOrderSegmentScripts(scripts: string): void {
    this.$rootContainer$.emitOutOfOrderSegmentScripts(scripts);
  }

  override emitOutOfOrderExecutorIfNeeded(): void {
    this.$rootContainer$.emitOutOfOrderExecutorIfNeeded();
  }

  $recordExternalRootEffect$(
    producer: unknown,
    effect: EffectSubscription,
    prop: string | symbol | null,
    sourceEffects?: Map<string | symbol, Set<EffectSubscription>>
  ): void {
    recordExternalRootEffect(
      this.$rootContainer$.serializationCtx,
      this.serializationCtx,
      this.$rootContainer$.$storeProxyMap$,
      this.subscriptionPatchRecords,
      producer,
      effect,
      prop,
      sourceEffects
    );
  }

  async $finalizeOutOfOrderSegment$(
    segmentId: string,
    segment: SSROutOfOrderSegment
  ): Promise<{ html: string; scripts: string }> {
    const rootContainer = this.$rootContainer$;
    const rootReadyAtSegment = rootContainer.$isReadyForOOOS$();
    const segmentSerializationCtx = this.serializationCtx;

    try {
      const commit = this.$commitRoots$(rootContainer, segmentSerializationCtx);
      this.$mergeSegmentEventData$(rootContainer, segmentSerializationCtx);
      this.$mergeSegmentSyncFns$(rootContainer, segmentSerializationCtx);
      const subscriptionPatchRootId = this.$addSubscriptionsToRoots$(
        rootContainer,
        rootReadyAtSegment,
        segmentSerializationCtx
      );
      if (
        rootReadyAtSegment &&
        (commit.newRootLocalIds.length > 0 || subscriptionPatchRootId !== undefined)
      ) {
        segmentSerializationCtx.$forwardRefOffset$ =
          rootContainer.serializationCtx.$serializedForwardRefCount$;
        await this.emitStatePatchData(
          segmentId,
          commit.newRootStart,
          commit.newRootLocalIds,
          subscriptionPatchRootId
        );
        rootContainer.serializationCtx.$serializedRootCount$ =
          rootContainer.serializationCtx.$roots$.length +
          (rootContainer.serializationCtx.$hasRootStateForwardRefs$ ? 1 : 0);
        rootContainer.serializationCtx.$serializedForwardRefCount$ +=
          segmentSerializationCtx.$serializedForwardRefCount$;
      }
      this.emitPendingVNodeDataPatches();
      if (rootReadyAtSegment) {
        this.$noMoreRoots$ = true;
        this.emitVNodeData(segmentId);
        const segmentCtx = this.serializationCtx;
        this.serializationCtx = rootContainer.serializationCtx;
        this.emittedSyncFnCount = rootContainer.emittedSyncFnCount;
        this.emitSyncFnsData(true);
        rootContainer.emittedSyncFnCount = this.emittedSyncFnCount;
        this.serializationCtx = segmentCtx;
        this.emitNewQwikEvents();
      }
      this.emitPatchDataIfNeeded();
      this.drainCleanupQueue();
      const rootIdMap = commit.rootIdMap;
      if (rootReadyAtSegment) {
        this.$outOfOrderState$ = OutOfOrderSegmentState.Done;
      } else {
        this.$outOfOrderRootIdMap$ = rootIdMap;
        this.$outOfOrderState$ = OutOfOrderSegmentState.EarlyFinalized;
      }
      return {
        html: renderSSRChunks(segment.htmlChunks, rootIdMap),
        scripts: segment.writer.toString(rootIdMap),
      };
    } finally {
      if (this.$outOfOrderState$ !== OutOfOrderSegmentState.EarlyFinalized) {
        segmentSerializationCtx.$onAddRoot$ = undefined;
        rootContainer.removeOutOfOrderSegment(this);
      }
      rootContainer.serializationCtx.$setWriter$(rootContainer.writer);
    }
  }

  $emitDelayedOutOfOrderVNodeData$(): void {
    try {
      this.emitVNodeData(this.vnodeSegment!);
      this.emitPendingVNodeDataPatches();
      this.$rootContainer$.emitOutOfOrderSegmentScripts(
        this.writer.toString(this.$outOfOrderRootIdMap$!)
      );
      this.$outOfOrderState$ = OutOfOrderSegmentState.Done;
      this.$rootContainer$.removeOutOfOrderSegment(this);
    } finally {
      this.serializationCtx.$onAddRoot$ = undefined;
    }
  }

  private markVNodeDataForSerialization(
    node: VNodeDataSerializableNode,
    flags = VNodeDataFlag.SERIALIZE
  ): void {
    const previousFlags = node.vnodeData[0];
    const nextFlags = previousFlags | flags;
    if (nextFlags !== previousFlags) {
      node.vnodeData[0] = nextFlags;
      this.queueLateVNodeDataPatch(node, nextFlags & ~previousFlags);
    }
  }

  private queueLateVNodeDataPatch(node: VNodeDataSerializableNode, addedFlags: number): void {
    if (
      !__EXPERIMENTAL__.suspense ||
      !this.outOfOrderStreaming ||
      !(addedFlags & (VNodeDataFlag.SERIALIZE | VNodeDataFlag.REFERENCE))
    ) {
      return;
    }
    const owner = this.getVNodeDataOwnerFromNodeId(node.id);
    if (!this.$getRootContainer$().isVNodeDataOwnerEmitted(owner.owner)) {
      return;
    }
    let ownerPatches = (this.pendingVNodeDataPatches ||= new Map()).get(owner.owner);
    if (!ownerPatches) {
      this.pendingVNodeDataPatches.set(owner.owner, (ownerPatches = new Map()));
    }
    ownerPatches.set(owner.localIndex, node.vnodeData);
  }

  private emitPendingVNodeDataPatches(): void {
    const pendingPatches = this.pendingVNodeDataPatches;
    this.pendingVNodeDataPatches = null;
    if (!pendingPatches) {
      return;
    }
    for (const [owner, entries] of pendingPatches) {
      if (entries.size === 0) {
        continue;
      }
      const sortedEntries = Array.from(entries).sort((a, b) => a[0] - b[0]);
      this.emitVNodeDataScript(owner, sortedEntries, true);
    }
  }

  private $commitRoots$(
    rootContainer: SSRContainer,
    segmentSerializationCtx: SerializationContext
  ): SegmentRootCommit {
    const commit = this.commitSegmentRoots(rootContainer, segmentSerializationCtx);
    segmentSerializationCtx.$onAddRoot$ = (localId, root, obj) => {
      this.commitSegmentRoot(rootContainer, localId, root, obj, commit);
    };
    return commit;
  }

  private $addSubscriptionsToRoots$(
    rootContainer: SSRContainer,
    rootReadyAtSegment: boolean,
    segmentSerializationCtx: SerializationContext
  ) {
    let subscriptionPatchRootId: number | undefined = undefined;
    const subscriptionPatches = rootReadyAtSegment
      ? this.collectSubscriptionPatches(
          rootContainer,
          rootContainer.rootContainerSerializedRootCount
        )
      : undefined;
    if (subscriptionPatches) {
      subscriptionPatchRootId = segmentSerializationCtx.$addRoot$(subscriptionPatches);
    }
    return subscriptionPatchRootId;
  }

  private commitSegmentRoots(
    rootContainer: SSRContainer,
    segmentSerializationCtx: SerializationContext
  ): SegmentRootCommit {
    const rootIdMap: number[] = [];
    const newRootStart = rootContainer.$isReadyForOOOS$()
      ? rootContainer.serializationCtx.$serializedRootCount$
      : rootContainer.serializationCtx.$roots$.length;
    const newRootLocalIds: number[] = [];
    const commit = {
      rootIdMap,
      newRootStart,
      newRootLocalIds,
    };
    this.promoteSharedSegmentRoots(rootContainer, segmentSerializationCtx, commit);
    const segmentRoots = segmentSerializationCtx.$roots$;
    const segmentRootObjs = segmentSerializationCtx.$rootObjs$;
    for (let i = 0; i < segmentRoots.length; i++) {
      const rootObj = segmentRootObjs[i];
      this.commitSegmentRoot(rootContainer, i, segmentRoots[i], rootObj, commit);
    }
    return commit;
  }

  private promoteSharedSegmentRoots(
    rootContainer: SSRContainer,
    segmentSerializationCtx: SerializationContext,
    commit: SegmentRootCommit
  ): void {
    const segmentRoots = segmentSerializationCtx.$roots$;
    const segmentRootObjs = segmentSerializationCtx.$rootObjs$;
    for (let i = 0; i < segmentRootObjs.length; i++) {
      const rootObj = segmentRootObjs[i];
      if (this.isRootOrUsedByOtherLiveSegment(rootContainer, rootObj)) {
        this.commitSegmentRoot(rootContainer, i, segmentRoots[i], rootObj, commit);
      }
    }
  }

  private isRootOrUsedByOtherLiveSegment(rootContainer: SSRContainer, obj: unknown): boolean {
    if (rootContainer.serializationCtx.$hasRootId$(obj) !== undefined) {
      return true;
    }
    const segments = rootContainer.outOfOrderSegments;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === this) {
        continue;
      }
      const rootObjs = segment.serializationCtx.$rootObjs$;
      for (let j = 0; j < rootObjs.length; j++) {
        if (rootObjs[j] === obj) {
          return true;
        }
      }
    }
    return false;
  }

  private commitSegmentRoot(
    rootContainer: SSRContainer,
    localId: number,
    root: unknown,
    rootObj: unknown,
    commit: SegmentRootCommit
  ): void {
    if (commit.rootIdMap[localId] !== undefined) {
      return;
    }
    let rootId = rootContainer.serializationCtx.$hasRootId$(rootObj);
    if (rootId === undefined) {
      rootId = rootContainer.serializationCtx.$commitRoot$(root, rootObj);
      commit.newRootLocalIds.push(localId);
      this.seedCommittedRootForLiveSegments(rootContainer, rootObj);
    }
    const rootCtx = rootContainer.serializationCtx;
    commit.rootIdMap[localId] =
      rootContainer.$isReadyForOOOS$() && rootId >= rootCtx.$rootStateRootCount$
        ? rootId + (rootCtx.$hasRootStateForwardRefs$ ? 1 : 0)
        : rootId;
  }

  private seedCommittedRootForLiveSegments(rootContainer: SSRContainer, rootObj: unknown): void {
    const segments = rootContainer.outOfOrderSegments;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment !== this && segment.$outOfOrderState$ === OutOfOrderSegmentState.Rendering) {
        segment.serializationCtx.$addRoot$(rootObj);
      }
    }
  }

  private $mergeSegmentEventData$(
    rootContainer: SSRContainer,
    segmentSerializationCtx: SerializationContext
  ): void {
    for (const eventName of segmentSerializationCtx.$eventNames$) {
      rootContainer.serializationCtx.$eventNames$.add(eventName);
    }
    for (const qrl of segmentSerializationCtx.$eventQrls$) {
      rootContainer.serializationCtx.$eventQrls$.add(qrl);
    }
  }

  private $mergeSegmentSyncFns$(
    rootContainer: SSRContainer,
    segmentSerializationCtx: SerializationContext
  ): void {
    rootContainer.serializationCtx.$syncFns$.push(...segmentSerializationCtx.$syncFns$);
  }

  private collectSubscriptionPatches(rootContainer: SSRContainer, rootLimit: number) {
    if (!__EXPERIMENTAL__.suspense || !this.outOfOrderStreaming) {
      return;
    }
    return collectSubscriptionPatches(
      rootContainer.serializationCtx,
      this.subscriptionPatchRecords,
      rootLimit
    );
  }

  private emitStatePatchData(
    segmentId: string,
    rootStart: number,
    rootIds: number[],
    subscriptionPatchRootId?: number | string | number[]
  ): ValueOrPromise<void> {
    const attrs = this.statePatchScriptAttrs(segmentId);
    this.openScript(attrs);
    this.serializationCtx.$setWriter$(this.writer);
    this.serializationCtx.$markSsrNodeForSerialization$ =
      this.markVNodeDataForSerialization.bind(this);
    return maybeThen(
      this.serializationCtx.$serializePatch$(rootStart, rootIds, subscriptionPatchRootId),
      () => {
        this.closeScript();
      }
    );
  }

  private statePatchScriptAttrs(segmentId?: string): Props {
    const attrs = this.stateScriptAttrs();
    attrs[QStatePatchAttr] = true;
    if (segmentId) {
      attrs[QSuspenseResolved] = segmentId;
    }
    return attrs;
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
