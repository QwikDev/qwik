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
import { DomRef, SsrComponentFrame, SsrNode } from './ssr-node';
import { Q_FUNCS_PREFIX } from './ssr-render';
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

enum QwikLoaderInclude {
  Module,
  Inline,
  Done,
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
}

const EMPTY_OBJ = {};

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

  private lastNode: ISsrNode | null = null;
  private currentComponentNode: ISsrNode | null = null;
  private styleIds = new Set<string>();
  private isBackpatchExecutorEmitted = false;
  private backpatchMap = new Map<number, BackpatchEntry[]>();

  private currentElementFrame: ElementFrame | null = null;

  private renderTimer: ReturnType<typeof createTimer>;
  /**
   * Current element index.
   *
   * This number must match the depth-first traversal of the DOM elements as returned by the
   * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  private depthFirstElementCount: number = -1;
  private vNodeDatas: VNodeData[] = [];
  private componentStack: ISsrComponentFrame[] = [];
  private cleanupQueue: CleanupQueue = [];
  private emitContainerDataFrame: ElementFrame | null = null;
  public $instanceHash$ = hash();
  // Temporary flag to find missing roots after the state was serialized
  private $noMoreRoots$ = false;
  private qlInclude: QwikLoaderInclude;
  private promiseAttributes: Array<Promise<any>> | null = null;

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
    await _walkJSX(this, jsx, {
      currentStyleScoped: null,
      parentComponentFrame: this.getComponentFrame(),
    });
    await this.closeContainer();
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

  private $noScriptHere$: number = 0;

  /** Renders opening tag for DOM element */
  openElement(
    elementName: string,
    key: string | null,
    varAttrs: Props | null,
    constAttrs: Props | null = null,
    styleScopedId: string | null = null,
    currentFile: string | null = null
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
      innerHTML = this.writeAttrs(elementName, varAttrs, false, styleScopedId, currentFile);
    }
    this.write(' ' + Q_PROPS_SEPARATOR);
    if (key !== null) {
      this.write(`="${key}"`);
    } else if (import.meta.env.TEST) {
      // Domino sometimes does not like empty attributes, so we need to add a empty value
      this.write(EMPTY_ATTR);
    }
    if (constAttrs && !isObjectEmpty(constAttrs)) {
      innerHTML =
        this.writeAttrs(elementName, constAttrs, true, styleScopedId, currentFile) || innerHTML;
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
    if (!isSelfClosingTag(elementName)) {
      this.write(CLOSE_TAG);
      this.write(elementName);
      this.write(GT);
    }
    this.lastNode = null;
    if (this.qlInclude === QwikLoaderInclude.Inline) {
      // keep track of noscript and template
      if (elementName === 'noscript' || elementName === 'template') {
        this.$noScriptHere$--;
      }
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

      this.openFragment(
        isDev
          ? { [DEBUG_TYPE]: VirtualType.Projection, [QSlotParent]: componentFrame.componentNode.id }
          : { [QSlotParent]: componentFrame.componentNode.id }
      );
      const lastNode = this.getOrCreateLastNode();
      if (lastNode.vnodeData) {
        lastNode.vnodeData[0] |= VNodeDataFlag.SERIALIZE;
      }
      componentFrame.componentNode.setProp(slotName, lastNode.id);
      // Use projectionComponentFrame so that Slots can find their projections from the correct parent
      await _walkJSX(this, children, {
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
      return this.serializationCtx.$hasRootId$(obj);
    }
    return this.serializationCtx.$addRoot$(obj);
  }

  getOrCreateLastNode(): ISsrNode {
    if (!this.lastNode) {
      this.lastNode = vNodeData_createSsrNodeReference(
        this.currentComponentNode,
        this.currentElementFrame!.vNodeData,
        // we start at -1, so we need to add +1
        this.currentElementFrame!.depthFirstElementIdx + 1,
        this.cleanupQueue,
        this.currentElementFrame!.currentFile
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
      let value = fragmentAttrs[key] as string;
      let encodeValue = false;
      if (typeof value !== 'string') {
        const rootId = this.addRoot(value);
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

    this.backpatchMap.clear();

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
      parent: this.currentElementFrame,
      elementName,
      depthFirstElementIdx,
      vNodeData: [VNodeDataFlag.NONE],
      currentFile: isDev ? currentFile || null : null,
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
    currentFile: string | null
  ): string | undefined {
    let innerHTML: string | undefined = undefined;
    let isLoopElement = null;
    for (let key in attrs) {
      let value = attrs[key];
      if (isSSRUnsafeAttr(key)) {
        if (isDev) {
          throw qError(QError.unsafeAttr, [key]);
        }
        continue;
      }

      if (isHtmlAttributeAnEventName(key)) {
        if (isLoopElement === null) {
          // check this only once for the entire element
          isLoopElement = attributesContainsIterationProp(attrs);
        }
        value = _setEvent(this.serializationCtx, key, value, isLoopElement);
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
          this.trackSignalValue(signal, lastNode, key, signalData)
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

      const serializedValue = serializeAttribute(key, value, styleScopedId);
      if (serializedValue != null && serializedValue !== false) {
        this.write(SPACE);
        this.write(key);
        if (serializedValue !== true) {
          this.write(ATTR_EQUALS_QUOTE);
          const strValue = escapeHTML(String(serializedValue));
          this.write(strValue);
          this.write(QUOTE);
        }
      }
    }
    return innerHTML;
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

const isQwikStyleElement = (tag: string, attrs: Props | null) => {
  if (tag === 'style' && attrs != null) {
    return (
      Object.prototype.hasOwnProperty.call(attrs, QStyle) ||
      Object.prototype.hasOwnProperty.call(attrs, QScopedStyle)
    );
  }
  return false;
};

const attributesContainsIterationProp = (attrs: Props): boolean => {
  return (
    Object.prototype.hasOwnProperty.call(attrs, ITERATION_ITEM_SINGLE) ||
    Object.prototype.hasOwnProperty.call(attrs, ITERATION_ITEM_MULTI)
  );
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

function hash() {
  return Math.random().toString(36).slice(2);
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
