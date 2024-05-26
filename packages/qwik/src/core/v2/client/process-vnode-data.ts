// NOTE: we want to move this function to qwikloader, and therefore this function should not have any external dependencies
import { VNodeDataChar, VNodeDataSeparator } from '../shared/vnode-data-types';
import type { ContainerElement, ElementVNode, QDocument } from './types';

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
 *     <!--q:container="ABC"-->
 *     ...
 *     <!--/q:container="ABC"-->
 *     after
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
export function processVNodeData(document: Document) {
  const Q_CONTAINER = 'q:container';
  const Q_CONTAINER_END = '/' + Q_CONTAINER;
  const qDocument = document as QDocument;
  const vNodeDataMap =
    qDocument.qVNodeData || (qDocument.qVNodeData = new WeakMap<Element, string>());
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
  const getNodeType = getter(prototype, 'nodeType') as (this: Node) => number;

  // Process all of the `qwik/vnode` script tags by attaching them to the corresponding containers.
  Array.from(document.querySelectorAll('script[type="qwik/vnode"]')).forEach((script) => {
    script.setAttribute('type', 'x-qwik/vnode');
    const qContainerElement = script.closest('[q\\:container]') as ContainerElement | null;
    qContainerElement!.qVnodeData = script.textContent!;
    qContainerElement!.qVNodeRefs = new Map<number, Element | ElementVNode>();
  });

  ///////////////////////////////
  // Functions to consume the tree.
  ///////////////////////////////

  const enum NodeType {
    CONTAINER_MASK /* ******* */ = 0b001,
    ELEMENT /* ************** */ = 0b010, // regular element
    ELEMENT_CONTAINER /* **** */ = 0b011, // container element need to descend into it
    COMMENT_SKIP_START /* *** */ = 0b101, // Comment but skip the content until COMMENT_SKIP_END
    COMMENT_SKIP_END /* ***** */ = 0b110, // Comment end
    OTHER /* **************** */ = 0b000,
  }

  /**
   * Looks up which type of node this is in a monomorphic way which should be faster.
   *
   * See: https://mhevery.github.io/perf-tests/DOM-megamorphic.html
   */
  const getFastNodeType = (node: Node): NodeType => {
    const nodeType = getNodeType.call(node);
    if (nodeType === 1 /* Node.ELEMENT_NODE */) {
      const qContainer = getAttribute.call(node, Q_CONTAINER);
      return qContainer === null ? NodeType.ELEMENT : NodeType.ELEMENT_CONTAINER;
    } else if (nodeType === 8 /* Node.COMMENT_NODE */) {
      const nodeValue = node.nodeValue || ''; // nodeValue is monomorphic so it does not need fast path
      if (nodeValue.startsWith(Q_CONTAINER)) {
        return NodeType.COMMENT_SKIP_START;
      } else if (nodeValue.startsWith(Q_CONTAINER_END)) {
        return NodeType.COMMENT_SKIP_END;
      }
    }
    return NodeType.OTHER;
  };

  const isSeparator = (ch: number) => /* `!` */ 33 <= ch && ch <= 47; /* `/` */
  /**
   * Given the `vData` string, `start` index, and `end` index, find the end of the VNodeData
   * section.
   */
  const findVDataSectionEnd = (vData: string, start: number, end: number): number => {
    let depth = 0;
    while (true as boolean) {
      // look for the end of VNodeData
      if (start < end) {
        const ch = vData.charCodeAt(start);
        if (depth === 0 && isSeparator(ch)) {
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
  const walkContainer = (
    walker: TreeWalker,
    containerNode: Node | null,
    node: Node | null,
    exitNode: Node | null,
    vData: string,
    qVNodeRefs: Map<number, Element | ElementVNode>,
    prefix: string
  ) => {
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
        // console.log('ADVANCE', vNodeElementIndex, ch, ch - 33);
        elementsToSkip += 1 << (ch - VNodeDataSeparator.ADVANCE_1);
        vData_start++;
        if (vData_start >= vData_length) {
          // we reached the end of the vNodeData stop.
          break;
        }
      }
      return elementsToSkip;
    };

    do {
      if (node === exitNode) {
        return;
      }
      nextNode = null;
      const nodeType = node == containerNode ? NodeType.ELEMENT : getFastNodeType(node!);
      if (nodeType === NodeType.ELEMENT_CONTAINER) {
        // If we are in a container, we need to skip the children.
        const container = node as ContainerElement;
        let cursor = node;
        while (cursor && !(nextNode = nextSibling(cursor))) {
          cursor = cursor!.parentNode;
        }
        // console.log('EXIT', nextNode?.outerHTML);
        walkContainer(
          walker,
          container,
          node,
          nextNode,
          container.qVnodeData || '',
          container.qVNodeRefs!,
          prefix + '  '
        );
      } else if (nodeType === NodeType.COMMENT_SKIP_START) {
        // If we are in a container, we need to skip the children.
        nextNode = node;
        do {
          nextNode = nextSibling(nextNode);
          if (!nextNode) {
            throw new Error(`<!--${node?.nodeValue}--> not closed!`);
          }
        } while (getFastNodeType(nextNode) !== NodeType.COMMENT_SKIP_END);
        // console.log('EXIT', nextNode?.outerHTML);
        walkContainer(walker, node, node, nextNode, '', null!, prefix + '  ');
      }

      if ((nodeType & NodeType.ELEMENT) === NodeType.ELEMENT) {
        if (vNodeElementIndex < elementIdx) {
          // VNodeData needs to catch up with the elementIdx
          if (vNodeElementIndex === -1) {
            vNodeElementIndex = 0;
          }
          vData_start = vData_end;
          if (vData_start < vData_length) {
            vNodeElementIndex += howManyElementsToSkip();
            const shouldStoreRef = ch === VNodeDataSeparator.REFERENCE;
            if (shouldStoreRef) {
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
            vData_end = vData_start;
            vData_end = findVDataSectionEnd(vData, vData_start, vData_length);
          } else {
            vNodeElementIndex = Number.MAX_SAFE_INTEGER;
          }
        }
        // console.log(
        //   prefix,
        //   'ELEMENT',
        //   nodeType,
        //   elementIdx,
        //   vNodeElementIndex,
        //   (node as any).outerHTML,
        //   elementIdx === vNodeElementIndex ? vData.substring(vData_start, vData_end) : ''
        // );
        if (elementIdx === vNodeElementIndex) {
          if (needsToStoreRef === elementIdx) {
            qVNodeRefs.set(elementIdx, node as Element);
          }
          const instructions = vData.substring(vData_start, vData_end);
          vNodeDataMap.set(node as Element, instructions);
        }
        elementIdx++;
      }
    } while ((node = nextNode || walker.nextNode()));
  };

  // Walk the tree and process each `q:container` element.
  const walker = document.createTreeWalker(
    document,
    0x1 /* NodeFilter.SHOW_ELEMENT  */ | 0x80 /*  NodeFilter.SHOW_COMMENT */
  );

  walkContainer(walker, null, walker.firstChild(), null, '', null!, '');
}
