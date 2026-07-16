// NOTE: we want to move this function to qwikloader, and therefore this function should not have any external dependencies
import type { QElement } from '../shared/types';
import {
  VNodeDataChar,
  VNodeDataSeparator,
  getSegmentVNodeRefId,
} from '../shared/vnode-data-types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import { logError } from '../shared/utils/log';
import type { ContainerElement, QDocument } from './types';
import {
  createYieldingIteratorState,
  scheduleYieldingIterator,
  type YieldingIteratorState,
} from './yielding-iterator';

const Q_SUSPENSE_RESOLVED = 'q:r';
const Q_PATCH = 'q:patch';

type VNodeDataScope = Document | ShadowRoot;

interface ProcessVNodeDataState {
  $queue$: Generator<void, void, void>[];
  $active$: YieldingIteratorState<void> | null;
}

/**
 * Process the VNodeData script tags and store the VNodeData in the VNodeDataMap.
 *
 * The end result of this function is that each DOM element has the associated `VNodeData` attached
 * to it, to be used later `VNode` materialization. The "attachment" is done through the
 * `VNodeDataMap`.
 *
 * Run this function on startup to process the `<script type="qwik/vnode">` tags. The data in the
 * tags needs to be parsed and attached to the DOM elements. (We do this through `VNodeDataMap`)
 * `VNodeDataMap` is then used to lazily materialize the VNodes.
 *
 * Only one invocation of this function is needed per document/browser session.
 *
 * Below is an example of the kinds of constructs which need to be handled when dealing with
 * VNodeData deserialization.
 *
 * ```
 * <html q:container="paused">
 *   <body>
 *     <div q:container="paused">
 *       <script type="qwik/vnode">...</script>
 *     </div>
 *     <div q:container="html">...</div>
 *     before
 *     <!--q:container=ABC-->
 *     ...
 *     <!--/q:container-->
 *     after
 *     <!--q:ignore=FOO-->
 *     ...
 *        <!--q:container-island=BAR-->
 *        <div>some interactive island</div>
 *        <!--/q:container-island-->
 *     ...
 *     <!--/q:ignore-->
 *     <textarea q:container="text">...</textarea>
 *     <script type="qwik/vnode">...</script>
 *   </body>
 * </html>
 * ```
 *
 * Each `qwik/vnode` script assumes that the elements are numbered in depth first order. For this
 * reason, whenever the `processVNodeData` comes across a `q:container` it must ignore its
 * children.
 *
 * IMPLEMENTATION:
 *
 * - Stack to keep track of the current `q:container` being processed.
 * - Attach all `qwik/vnode` scripts (not the data contain within them) to the `q:container` element.
 * - Walk the tree and process each `q:container` element.
 */
export function processVNodeData(document: Document, containerElement?: ContainerElement): void {
  const qDocument = document as QDocument;
  // Per-container gate: a walk already populated this container's refs → done.
  if (containerElement?.qVNodeRefs) {
    return;
  }
  // A document-wide walk is in flight; it will pick up this newly-added container too.
  if (qDocument.qVNodeDataStarted && !qDocument.qVNodeDataProcessed) {
    return;
  }
  qDocument.qVNodeDataStarted = true;
  qDocument.qVNodeData ||= new WeakMap<Element, string>();
  enqueueProcessVNodeDataJob(qDocument, processRootVNodeData(document));
}

export function processOutOfOrderSegmentVNodeData(
  document: Document,
  segmentId: string,
  contentNode: Element | null
): void {
  if (!__EXPERIMENTAL__.suspense || !contentNode) {
    return;
  }
  const qContainerElement = contentNode.closest('[q\\:container]') as ContainerElement | null;
  if (!qContainerElement) {
    return;
  }
  const script = qContainerElement.querySelector(
    `script[type="qwik/vnode"][q\\:r="${segmentId}"]:not([q\\:patch])`
  );
  const patches = qContainerElement.querySelectorAll(
    `script[type="qwik/vnode"][q\\:r="${segmentId}"][q\\:patch]`
  );
  enqueueProcessVNodeDataJob(
    document as QDocument,
    processOutOfOrderSegmentVNodeDataIterator(
      document,
      segmentId,
      qContainerElement,
      contentNode,
      script?.textContent || undefined,
      patches
    )
  );
}

export const onVNodeDataReady = (document: Document, callback: () => void): void => {
  const qDocument = document as QDocument;
  if (qDocument.qVNodeDataReady) {
    callback();
  } else {
    (qDocument.qVNodeDataCallbacks ||= []).push(callback);
  }
};

export const whenVNodeDataReady = <T>(
  document: Document,
  callback: () => T | Promise<T>
): T | Promise<T> => {
  const qDocument = document as QDocument;
  if (qDocument.qVNodeDataReady) {
    return callback();
  }
  return new Promise<T>((resolve, reject) => {
    onVNodeDataReady(document, () => {
      try {
        resolve(callback());
      } catch (error) {
        reject(error);
      }
    });
  });
};

export function enqueueProcessVNodeDataJob(
  qDocument: QDocument,
  iterator: Generator<void, void, void>
): void {
  const state = (qDocument.qVNodeDataState ||= {
    $queue$: [],
    $active$: null,
  }) as ProcessVNodeDataState;
  qDocument.qProcessVNodeDataPatch ||= (script) =>
    enqueueProcessVNodeDataJob(qDocument, processVNodeDataPatch(qDocument, script));
  qDocument.qVNodeDataReady = false;
  state.$queue$.push(iterator);
  scheduleProcessVNodeData(qDocument, state);
}

function scheduleProcessVNodeData(qDocument: QDocument, state: ProcessVNodeDataState): void {
  if (state.$active$) {
    return;
  }
  const iterator = state.$queue$.shift();
  if (!iterator) {
    markVNodeDataReady(qDocument);
    return;
  }
  state.$active$ = createYieldingIteratorState(
    runProcessVNodeData(qDocument, state, iterator),
    () => {
      if (qDocument.qVNodeDataState === state) {
        state.$active$ = null;
        scheduleProcessVNodeData(qDocument, state);
      }
    },
    (error) => {
      state.$active$ = null;
      logError(error);
      markVNodeDataReady(qDocument);
    }
  );
  scheduleYieldingIterator(state.$active$);
}

function* runProcessVNodeData(
  qDocument: QDocument,
  state: ProcessVNodeDataState,
  iterator: Generator<void, void, void>
): Generator<void, void, void> {
  while (qDocument.qVNodeDataState === state) {
    if (iterator.next().done) {
      return;
    }
    yield;
  }
}

function markVNodeDataReady(document: QDocument): void {
  if (document.qVNodeDataReady) {
    return;
  }
  document.qVNodeDataReady = true;
  document.qVNodeDataState = undefined;
  const callbacks = document.qVNodeDataCallbacks;
  document.qVNodeDataCallbacks = undefined;
  if (callbacks) {
    for (let i = 0; i < callbacks.length; i++) {
      callbacks[i]();
    }
  }
}

function* processRootVNodeData(document: Document): Generator<void, void, void> {
  yield* processVNodeDataImpl(document);
  const qDocument = document as QDocument;
  qDocument.qVNodeDataProcessed = true;
  // Re-open the gate so a container added after this drain re-runs a walk.
  qDocument.qVNodeDataStarted = false;
}

function* processOutOfOrderSegmentVNodeDataIterator(
  document: Document,
  segmentId: string,
  segmentContainer: ContainerElement,
  segmentContent: Element,
  segmentVNodeData: string | undefined,
  patches: NodeListOf<Element>
): Generator<void, void, void> {
  yield* processVNodeDataImpl(
    document,
    segmentId,
    segmentContainer,
    segmentContent,
    segmentVNodeData
  );
  for (let i = 0; i < patches.length; i++) {
    yield* processVNodeDataPatch(document, patches[i]);
  }
}

function* processVNodeDataPatch(
  document: Document,
  script: Element | null
): Generator<void, void, void> {
  const qContainerElement = script?.closest('[q\\:container]') as ContainerElement | null;
  const patchSegment = script?.getAttribute(Q_SUSPENSE_RESOLVED);
  const contentNode =
    qContainerElement &&
    (patchSegment
      ? (qContainerElement.querySelector(`[q\\:rp="${patchSegment}"]`) as Element | null)
      : qContainerElement);
  if (qContainerElement && contentNode) {
    yield* processVNodeDataImpl(
      document,
      patchSegment || undefined,
      qContainerElement,
      contentNode,
      script!.textContent!
    );
  }
}

function* processVNodeDataImpl(
  document: Document,
  segmentId?: string,
  segmentContainer?: ContainerElement | null,
  segmentContent?: Element | null,
  segmentVNodeData?: string
): Generator<void, void, void> {
  const Q_CONTAINER = 'q:container';
  const Q_CONTAINER_END = '/' + Q_CONTAINER;
  const Q_PROPS_SEPARATOR = ':';
  const Q_SHADOW_ROOT = 'q:shadowroot';
  const Q_IGNORE = 'q:ignore';
  const Q_IGNORE_END = '/' + Q_IGNORE;
  const Q_CONTAINER_ISLAND = 'q:container-island';
  const Q_CONTAINER_ISLAND_END = '/' + Q_CONTAINER_ISLAND;
  const Q_SUSPENSE_RESULT_PARENT = 'q:rp';

  const enum NodeType {
    CONTAINER_MASK /* ***************** */ = 0b00000001,
    ELEMENT /* ************************ */ = 0b00000010, // regular element
    ELEMENT_CONTAINER /* ************** */ = 0b00000011, // container element need to descend into it
    ELEMENT_SHADOW_ROOT_WRAPPER /* **** */ = 0b00000110, // shadow root wrapper element with q:shadowroot attribute
    ELEMENT_SUSPENSE_RESULT_PARENT /* * */ = 0b10000010,
    COMMENT_SKIP_START /* ************* */ = 0b00001001, // Comment but skip the content until COMMENT_SKIP_END
    COMMENT_SKIP_END /* *************** */ = 0b00001000, // Comment end
    COMMENT_IGNORE_START /* *********** */ = 0b00010000, // Comment ignore, descend into children and skip the content until COMMENT_ISLAND_START
    COMMENT_IGNORE_END /* ************* */ = 0b00100000, // Comment ignore end
    COMMENT_ISLAND_START /* *********** */ = 0b01000001, // Comment island, count elements for parent container until COMMENT_ISLAND_END
    COMMENT_ISLAND_END /* ************* */ = 0b01000000, // Comment island end
    OTHER /* ************************** */ = 0b00000000,
  }

  const qDocument = document as QDocument;
  const vNodeDataMap = (qDocument.qVNodeData ||= new WeakMap<Element, string>());
  const prototype: any = document.body;
  const getter = (prototype: any, name: string) => {
    let getter: any;
    while (prototype && !(getter = Object.getOwnPropertyDescriptor(prototype, name)?.get)) {
      prototype = Object.getPrototypeOf(prototype);
    }
    return (
      getter ||
      function (this: any) {
        return this[name];
      }
    );
  };
  const getAttribute = prototype.getAttribute as (this: Node, name: string) => string | null;
  const hasAttribute = prototype.hasAttribute as (this: Node, name: string) => boolean;
  const getNodeType = getter(prototype, 'nodeType') as (this: Node) => number;

  // Process all of the `qwik/vnode` script tags by attaching them to the corresponding containers.
  const attachVnodeDataAndRefs = function* (element: VNodeDataScope): Generator<void, void, void> {
    const scripts = element.querySelectorAll('script[type="qwik/vnode"]');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const qContainer = script.closest('[q\\:container]') as ContainerElement;
      qContainer.qVNodeRefs ||= new Map<number, Element | ElementVNode>();
      if (script.hasAttribute(Q_PATCH)) {
        qDocument.qProcessVNodeDataPatch?.(script);
        yield;
        continue;
      }

      const scriptContent = script.textContent!;
      const segment = __EXPERIMENTAL__.suspense && script.getAttribute(Q_SUSPENSE_RESOLVED);
      if (segment) {
        (qContainer.qSegmentVnodeData ||= new Map()).set(segment, scriptContent);
      } else {
        qContainer.qVnodeData = scriptContent;
      }
      yield;
    }
    const shadowRoots = element.querySelectorAll('[q\\:shadowroot]');
    for (let i = 0; i < shadowRoots.length; i++) {
      const parent = shadowRoots[i];
      const shadowRoot = parent.shadowRoot;
      if (shadowRoot) {
        yield* attachVnodeDataAndRefs(shadowRoot);
      }
      yield;
    }
  };

  ///////////////////////////////
  // Functions to consume the tree.
  ///////////////////////////////

  /**
   * Looks up which type of node this is in a monomorphic way which should be faster.
   *
   * See: https://mhevery.github.io/perf-tests/DOM-megamorphic.html
   */
  const getFastNodeType = (node: Node): NodeType => {
    const nodeType = getNodeType.call(node);
    if (nodeType === 1 /* Node.ELEMENT_NODE */) {
      if (getAttribute.call(node, Q_CONTAINER) !== null) {
        return NodeType.ELEMENT_CONTAINER;
      }
      if (hasAttribute.call(node, Q_SHADOW_ROOT)) {
        return NodeType.ELEMENT_SHADOW_ROOT_WRAPPER;
      }
      if (__EXPERIMENTAL__.suspense && getAttribute.call(node, Q_SUSPENSE_RESULT_PARENT) !== null) {
        return NodeType.ELEMENT_SUSPENSE_RESULT_PARENT;
      }
      return hasAttribute.call(node, Q_PROPS_SEPARATOR) ? NodeType.ELEMENT : NodeType.OTHER;
    } else if (nodeType === 8 /* Node.COMMENT_NODE */) {
      const nodeValue = node.nodeValue || ''; // nodeValue is monomorphic so it does not need fast path
      if (nodeValue.startsWith(Q_CONTAINER_ISLAND)) {
        return NodeType.COMMENT_ISLAND_START;
      } else if (nodeValue.startsWith(Q_IGNORE)) {
        return NodeType.COMMENT_IGNORE_START;
      } else if (nodeValue.startsWith(Q_CONTAINER)) {
        return NodeType.COMMENT_SKIP_START;
      } else if (nodeValue.startsWith(Q_CONTAINER_ISLAND_END)) {
        return NodeType.COMMENT_ISLAND_END;
      } else if (nodeValue.startsWith(Q_IGNORE_END)) {
        return NodeType.COMMENT_IGNORE_END;
      } else if (nodeValue.startsWith(Q_CONTAINER_END)) {
        return NodeType.COMMENT_SKIP_END;
      }
    }
    return NodeType.OTHER;
  };

  const nextSibling = (node: Node | null) => {
    // eslint-disable-next-line no-empty
    while (node && (node = node.nextSibling) && getFastNodeType(node) === NodeType.OTHER) {}
    return node;
  };

  /**
   * Process the container
   *
   * @param walker TreeWalker
   * @param containerNode The root of container element
   * @param exitNode The node which represents the last node and we should exit.
   * @param qVNodeRefs Place to store the VNodeRefs
   */
  const walkContainer = function* (
    walker: TreeWalker,
    containerNode: Node | null,
    node: Node | null,
    exitNode: Node | null,
    vData: string,
    qVNodeRefs: Map<number, Element | ElementVNode>,
    qContainerElement: ContainerElement | null,
    segmentId?: string
  ): Generator<void, void, void> {
    const isSegment = __EXPERIMENTAL__.suspense && segmentId !== undefined;
    const vData_length = vData.length;
    /// Stores the current element index as the TreeWalker traverses the DOM.
    let elementIdx = 0;
    /// Stores the current VNode index as derived from the VNodeData script tag.
    let vNodeElementIndex = -1;
    let vData_start = 0;
    let vData_end = 0;
    let ch = 0;
    let needsToStoreRef = -1;
    let nextNode: Node | null = null;

    /** Computes number of elements which need to be skipped to get to the next VNodeData section. */
    const howManyElementsToSkip = () => {
      let elementsToSkip = 0;
      while (isSeparator((ch = vData.charCodeAt(vData_start)))) {
        // Keep consuming the separators and incrementing the vNodeIndex
        elementsToSkip += 1 << (ch - VNodeDataSeparator.ADVANCE_1);
        vData_start++;
        if (vData_start >= vData_length) {
          // we reached the end of the vNodeData stop.
          break;
        }
      }
      return elementsToSkip;
    };

    if (!node) {
      return;
    }

    do {
      if (node === exitNode) {
        return;
      }
      nextNode = null;
      const nodeType = node == containerNode ? NodeType.ELEMENT : getFastNodeType(node!);
      if (nodeType === NodeType.ELEMENT_CONTAINER) {
        // If we are in a container, we need to skip the children.
        const container = node as ContainerElement;
        let cursor: Node | null = node;
        while (cursor && !(nextNode = nextSibling(cursor))) {
          cursor = cursor!.parentNode;
        }
        yield* walkContainer(
          walker,
          container,
          node,
          nextNode,
          container.qVnodeData || '',
          container.qVNodeRefs!,
          container
        );
      } else if (nodeType === NodeType.COMMENT_IGNORE_START) {
        let islandNode: Node | null = node;
        do {
          islandNode = walker.nextNode();
          if (!islandNode) {
            throw new Error(`Island inside <!--${node?.nodeValue}--> not found!`);
          }
        } while (getFastNodeType(islandNode) !== NodeType.COMMENT_ISLAND_START);
      } else if (nodeType === NodeType.COMMENT_ISLAND_END) {
        // Walk forward to find either the next container-island or the end of the q:ignore block.
        // This handles multiple islands within a single q:ignore block.
        nextNode = node;
        let nextNodeType: NodeType;
        do {
          nextNode = walker.nextNode();
          if (!nextNode) {
            throw new Error(`Ignore block not closed!`);
          }
          nextNodeType = getFastNodeType(nextNode);
        } while (
          nextNodeType !== NodeType.COMMENT_IGNORE_END &&
          nextNodeType !== NodeType.COMMENT_ISLAND_START
        );
        nextNode = null;
      } else if (nodeType === NodeType.COMMENT_SKIP_START) {
        // If we are in a container, we need to skip the children.
        nextNode = node;
        do {
          nextNode = nextSibling(nextNode);
          if (!nextNode) {
            throw new Error(`<!--${node?.nodeValue}--> not closed!`);
          }
        } while (getFastNodeType(nextNode) !== NodeType.COMMENT_SKIP_END);
        yield* walkContainer(walker, node, node, nextNode, '', null!, qContainerElement);
      } else if (nodeType === NodeType.ELEMENT_SHADOW_ROOT_WRAPPER) {
        // If we are in a shadow root, we need to get the shadow root element.
        nextNode = nextSibling(node);
        const shadowRootContainer = node as Element | null;
        const shadowRoot = shadowRootContainer?.shadowRoot;
        if (shadowRoot) {
          yield* walkContainer(
            // we need to create a new walker for the shadow root
            document.createTreeWalker(
              shadowRoot,
              0x1 /* NodeFilter.SHOW_ELEMENT  */ | 0x80 /*  NodeFilter.SHOW_COMMENT */
            ),
            null,
            shadowRoot,
            null,
            '',
            null!,
            null
          );
        }
      }

      if ((nodeType & NodeType.ELEMENT) === NodeType.ELEMENT) {
        if (isSegment && node !== containerNode) {
          const element = node as QElement;
          element._qSegment = segmentId;
        }
        if (vNodeElementIndex < elementIdx) {
          // VNodeData needs to catch up with the elementIdx
          if (vNodeElementIndex === -1) {
            vNodeElementIndex = 0;
          }
          vData_start = vData_end;
          if (vData_start < vData_length) {
            vNodeElementIndex += howManyElementsToSkip();
            if (ch === VNodeDataSeparator.REFERENCE) {
              // if we need to store the ref handle it here.
              needsToStoreRef = vNodeElementIndex;
              vData_start++;
              if (vData_start < vData_length) {
                ch = vData.charCodeAt(vData_end);
              } else {
                // assume separator on end.
                ch = VNodeDataSeparator.ADVANCE_1;
              }
            }
            vData_end = findVDataSectionEnd(vData, vData_start, vData_length);
          } else {
            vNodeElementIndex = Number.MAX_SAFE_INTEGER;
          }
        }
        const contentBoundaryId =
          __EXPERIMENTAL__.suspense &&
          !isSegment &&
          nodeType === NodeType.ELEMENT_SUSPENSE_RESULT_PARENT
            ? getAttribute.call(node!, Q_SUSPENSE_RESULT_PARENT)!
            : null;
        if (elementIdx === vNodeElementIndex) {
          if (needsToStoreRef === elementIdx && !(isSegment && node === containerNode)) {
            qVNodeRefs.set(
              isSegment ? getSegmentVNodeRefId(segmentId!, elementIdx) : elementIdx,
              node as Element
            );
          }
          const data = vData.substring(vData_start, vData_end);
          if (isSegment && node === containerNode) {
            const existing = vNodeDataMap.get(node as Element);
            if (existing === undefined || existing === '') {
              vNodeDataMap.set(node as Element, data);
            } else if (
              existing.charCodeAt(0) === VNodeDataChar.SEPARATOR &&
              existing.charCodeAt(1) === VNodeDataChar.SEPARATOR &&
              !existing.endsWith(data)
            ) {
              vNodeDataMap.set(node as Element, existing + data);
            }
          } else {
            vNodeDataMap.set(node as Element, data);
          }
        }
        elementIdx++;
        if (__EXPERIMENTAL__.suspense && contentBoundaryId !== null) {
          yield* processSuspenseContentSegment(
            qContainerElement,
            node as Element,
            contentBoundaryId
          );
          nextNode = nextSibling(node);
          if (nextNode) {
            walker.currentNode = nextNode;
          }
        }
      }
      yield;
    } while ((node = nextNode || walker.nextNode()));
  };

  const processVNodeDataScope = function* (
    qContainerElement: ContainerElement,
    contentNode: Element,
    vData: string,
    scopeSegmentId?: string
  ): Generator<void, void, void> {
    qContainerElement.qVNodeRefs ||= new Map<number, Element | ElementVNode>();
    const scopeWalker = document.createTreeWalker(
      document,
      0x1 /* NodeFilter.SHOW_ELEMENT  */ | 0x80 /*  NodeFilter.SHOW_COMMENT */
    );
    scopeWalker.currentNode = contentNode;
    yield* walkContainer(
      scopeWalker,
      contentNode,
      contentNode,
      nextSibling(contentNode),
      vData,
      qContainerElement.qVNodeRefs!,
      qContainerElement,
      scopeSegmentId
    );
  };

  const processSuspenseContentSegment = function* (
    qContainerElement: ContainerElement | null,
    contentNode: Element,
    boundaryId: string,
    vData?: string
  ): Generator<void, void, void> {
    vData ||= qContainerElement?.qSegmentVnodeData?.get(boundaryId);
    if (qContainerElement && vData) {
      yield* processVNodeDataScope(qContainerElement, contentNode, vData, boundaryId);
    }
  };

  if (segmentContainer && segmentContent && segmentVNodeData !== undefined) {
    segmentContainer.qVNodeRefs ||= new Map<number, Element | ElementVNode>();
    if (__EXPERIMENTAL__.suspense && segmentId !== undefined) {
      yield* processSuspenseContentSegment(
        segmentContainer,
        segmentContent,
        segmentId,
        segmentVNodeData
      );
    } else {
      yield* processVNodeDataScope(segmentContainer, segmentContent, segmentVNodeData);
    }
    return;
  }

  yield* attachVnodeDataAndRefs(document);

  // Walk the tree and process each `q:container` element.
  const walker = document.createTreeWalker(
    document,
    0x1 /* NodeFilter.SHOW_ELEMENT  */ | 0x80 /*  NodeFilter.SHOW_COMMENT */
  );

  yield* walkContainer(walker, null, walker.firstChild(), null, '', null!, null);
}

const isSeparator = (ch: number) =>
  /* `!` */ VNodeDataSeparator.ADVANCE_1 <= ch && ch <= VNodeDataSeparator.ADVANCE_8192; /* `.` */

/** Given the `vData` string, `start` index, and `end` index, find the end of the VNodeData section. */
export const findVDataSectionEnd = (vData: string, start: number, end: number): number => {
  let depth = 0;
  while (true as boolean) {
    // look for the end of VNodeData
    if (start < end) {
      const ch = vData.charCodeAt(start);
      if (ch === 92 /* \ */) {
        // Backslash escape - skip both the backslash and the next character
        start += 2;
      } else if (depth === 0 && isSeparator(ch)) {
        break;
      } else {
        if (ch === VNodeDataChar.OPEN) {
          depth++;
        } else if (ch === VNodeDataChar.CLOSE) {
          depth--;
        }
        start++;
      }
    } else {
      break;
    }
  }
  return start;
};
