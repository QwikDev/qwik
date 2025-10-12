/**
 * @file
 *
 *   VNode is a DOM like API for walking the DOM but it:
 *
 *   1. Encodes virtual nodes which don't exist in the DOM
 *   2. Can serialize as part of SSR and than deserialize on the client.
 *
 *   # Virtual
 *
 *   You can think of a Virtual node just like an additional `<div>` in that it groups related child
 *   nodes together. But unlike a `<div>` which has a real DOM node and hence implications for CSS,
 *   Virtual nodes have no DOM impact, they are invisible.
 *
 *   # Portal
 *
 *   Two Virtual nodes can be linked together to form a Portal. Portals are useful for projecting
 *   content or just rendering content in a different location in the tree, while maintaining a
 *   logical relationship.
 *
 *   Portals have:
 *
 *   - Portal Source: A Virtual node which can refer to one ore more Destination Portals by name.
 *   - Destination Portal: A Virtual node which acts as a destination but also has a pointer back to the
 *       Portal Source
 *
 *   ## Example:
 *
 *   Given this code:
 *
 *   ```typescript
 *   const Parent = component$(() => {
 *     return (
 *       <Child>
 *         Projection Content
 *         <span q:slot="secondary">Secondary Content</span>
 *         <span q:slot="other">Other Content</span>
 *       </Child>
 *     };
 *   });
 *
 *   const Child = component$(() => {
 *     return (
 *       <div>
 *         <Slot>Default Primary</Slot>
 *         <Slot name="secondary">Default Secondary</Slot>
 *       </div>
 *     );
 *   });
 *
 *   render(<body><main><Parent/></main><body>);
 * ```
 *
 *   Will render like so:
 *
 *   ```html
 *   <body>
 *     <main>
 *       <Virtual Parent q:portal=":3A;secondary:3B;other:5A" q:id="2A">
 *         <Virtual Child>
 *           <div>
 *             <Virtual Slot q:id="3A" q:portal="^:2A;:3A"> Projection Content </Virtual>
 *             <Virtual Slot q:id="3B" q:portal="^:2A;:3B">
 *               <span q:slot="secondary">Secondary Content</span>
 *             </Virtual>
 *           </div>
 *         </Virtual>
 *       </Virtual>
 *     </main>
 *     <q:template>
 *       <Virtual q:portal="^:2A" q:id="5A">
 *         <span q:slot="other">Other Content</span>
 *       </Virtual>
 *       <Virtual q:portal="^:2A" q:id="3A">
 *         Default Primary
 *       </Virtual>
 *       <Virtual q:portal="^:2A" q:id="3B">
 *         Default Secondary
 *       </Virtual>
 *     <q:template>
 *   </body>
 * ```
 *
 *   Explanation:
 *
 *   - `q:portal=":3A;secondary:3B;other:5A"`
 *
 *       - Name: ``; Ref: `3A` - Where the default content went.
 *       - Name: `secondary`; Ref: `3B` - Where the 'secondary' content went.
 *       - Name: `other`; Ref: `%A` - Where the `other` content went. (Notice in this case the content is
 *               left over and os it ends up en the `q:templates`. We can share one '<q:template>`
 *               for all left over content.)
 *   - `q:portal="^:2A;:3A"`
 *
 *       - Name: `^`; Ref: `2A` - Special pointer to the parent portal
 *       - Name: ``; Ref: `3A` - Location of the default content in case there is nothing projected here.
 *
 *   ## Rendering
 *
 *   During SSR, the rendered can delay rendering the JSX nodes until correct portal comes up. The ID
 *   system is already can make lazy references to the Nodes.
 *
 *   Client side rendering does not need to deal with IDs or `<q:template>` as un-rendered vNodes do
 *   not need to be serialized into DOM, and can remain on heap.
 *
 *   ## Context
 *
 *   When looking up context it is possible to follow you real render parents or follow the portals.
 *   All information is encoded in the portals.
 *
 *   ## Slot Projection
 *
 *   The ultimate user of portals is Slot projection. But the vNode do not understand slots, rather
 *   they understand portal primitives which makes Slot implementation much simpler.
 *
 *   NOTE: The portals need to have IDs during serialization only. Once runtime takes over, there is
 *   no need to have IDs or to write overflow to the `<q:template>`
 */

import { isDev } from '@qwik.dev/core/build';
import { qwikDebugToString } from '../debug';
import { assertDefined, assertEqual, assertFalse, assertTrue } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import {
  DEBUG_TYPE,
  QContainerValue,
  VirtualType,
  VirtualTypeName,
  type QElement,
} from '../shared/types';
import { isText } from '../shared/utils/element';
import {
  dangerouslySetInnerHTML,
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  ELEMENT_SEQ_IDX,
  OnRenderProp,
  Q_PROPS_SEPARATOR,
  QContainerAttr,
  QContainerAttrEnd,
  QContainerIsland,
  QContainerIslandEnd,
  QCtxAttr,
  QIgnore,
  QIgnoreEnd,
  QScopedStyle,
  QSlot,
  QStyle,
  QStylesAllSelector,
} from '../shared/utils/markers';
import { isHtmlElement } from '../shared/utils/types';
import { VNodeDataChar } from '../shared/vnode-data-types';
import { getDomContainer } from './dom-container';
import { mapArray_set } from './util-mapArray';
import {
  type ClientContainer,
  type ContainerElement,
  type QDocument,
  VNodeFlags,
  VNodeFlagsIndex,
} from './types';
import {
  vnode_getDomChildrenWithCorrectNamespacesToInsert,
  vnode_getElementNamespaceFlags,
} from './vnode-namespace';
import { mergeMaps } from '../shared/utils/maps';
import { _EFFECT_BACK_REF } from '../reactive-primitives/types';
import { ElementVNode, TextVNode, VirtualVNode, VNode } from './vnode-impl';

//////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Fundamental DOM operations are:
 *
 * - Insert new DOM element/text
 * - Remove DOM element/text
 * - Set DOM element attributes
 * - Set text node value
 */
export const enum VNodeJournalOpCode {
  SetText = 1, // ------ [SetAttribute, target, text]
  SetAttribute = 2, // - [SetAttribute, target, ...(key, values)]]
  HoistStyles = 3, // -- [HoistStyles, document]
  Remove = 4, // ------- [Remove, target(parent), ...nodes]
  RemoveAll = 5, // ------- [RemoveAll, target(parent)]
  Insert = 6, // ------- [Insert, target(parent), reference, ...nodes]
}

export type VNodeJournal = Array<
  VNodeJournalOpCode | Document | Element | Text | string | boolean | null
>;

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_newElement = (element: Element, elementName: string): ElementVNode => {
  assertEqual(fastNodeType(element), 1 /* ELEMENT_NODE */, 'Expecting element node.');
  const vnode: ElementVNode = new ElementVNode(
    VNodeFlags.Element | VNodeFlags.Inflated | (-1 << VNodeFlagsIndex.shift), // Flag
    null,
    null,
    null,
    null,
    null,
    element,
    elementName
  );
  assertTrue(vnode_isElementVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isVirtualVNode(vnode), 'Incorrect format of ElementVNode.');
  (element as QElement).vNode = vnode;
  return vnode;
};

export const vnode_newUnMaterializedElement = (element: Element): ElementVNode => {
  assertEqual(fastNodeType(element), 1 /* ELEMENT_NODE */, 'Expecting element node.');
  const vnode: ElementVNode = new ElementVNode(
    VNodeFlags.Element | (-1 << VNodeFlagsIndex.shift), // Flag
    null,
    null,
    null,
    undefined,
    undefined,
    element,
    undefined
  );
  assertTrue(vnode_isElementVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isVirtualVNode(vnode), 'Incorrect format of ElementVNode.');
  (element as QElement).vNode = vnode;
  return vnode;
};

export const vnode_newSharedText = (
  previousTextNode: TextVNode | null,
  sharedTextNode: Text | null,
  textContent: string
): TextVNode => {
  sharedTextNode &&
    assertEqual(fastNodeType(sharedTextNode), 3 /* TEXT_NODE */, 'Expecting element node.');
  const vnode: TextVNode = new TextVNode(
    VNodeFlags.Text | (-1 << VNodeFlagsIndex.shift), // Flag
    null, // Parent
    previousTextNode, // Previous TextNode (usually first child)
    null, // Next sibling
    sharedTextNode, // SharedTextNode
    textContent // Text Content
  );
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isVirtualVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode;
};

export const vnode_newText = (textNode: Text, textContent: string | undefined): TextVNode => {
  const vnode: TextVNode = new TextVNode(
    VNodeFlags.Text | VNodeFlags.Inflated | (-1 << VNodeFlagsIndex.shift), // Flags
    null, // Parent
    null, // No previous sibling
    null, // We may have a next sibling.
    textNode, // TextNode
    textContent // Text Content
  );
  assertEqual(fastNodeType(textNode), 3 /* TEXT_NODE */, 'Expecting element node.');
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isVirtualVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode;
};

export const vnode_newVirtual = (): VirtualVNode => {
  const vnode: VirtualVNode = new VirtualVNode(
    VNodeFlags.Virtual | (-1 << VNodeFlagsIndex.shift), // Flags
    null,
    null,
    null,
    null,
    null
  );
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isVirtualVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_isVNode = (vNode: any): vNode is VNode => {
  return vNode instanceof VNode;
};

export const vnode_isElementVNode = (vNode: VNode): vNode is ElementVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = vNode.flags;
  return (flag & VNodeFlags.Element) === VNodeFlags.Element;
};

export const vnode_isElementOrTextVNode = (vNode: VNode): vNode is ElementVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = vNode.flags;
  return (flag & VNodeFlags.ELEMENT_OR_TEXT_MASK) !== 0;
};

export const vnode_isElementOrVirtualVNode = (
  vNode: VNode
): vNode is ElementVNode | VirtualVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = vNode.flags;
  return (flag & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0;
};

/** @internal */
export const vnode_isMaterialized = (vNode: VNode): boolean => {
  assertDefined(vNode, 'Missing vNode');
  const flag = vNode.flags;
  return (
    (flag & VNodeFlags.Element) === VNodeFlags.Element &&
    (vNode as ElementVNode).firstChild !== undefined &&
    (vNode as ElementVNode).lastChild !== undefined
  );
};

/** @internal */
export const vnode_isTextVNode = (vNode: VNode): vNode is TextVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = vNode.flags;
  return (flag & VNodeFlags.Text) === VNodeFlags.Text;
};

/** @internal */
export const vnode_isVirtualVNode = (vNode: VNode): vNode is VirtualVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = vNode.flags;
  return (flag & VNodeFlags.Virtual) === VNodeFlags.Virtual;
};

export const vnode_isProjection = (vNode: VNode): vNode is VirtualVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = vNode.flags;
  return (flag & VNodeFlags.Virtual) === VNodeFlags.Virtual && vNode.getProp(QSlot, null) !== null;
};

const ensureTextVNode = (vNode: VNode): TextVNode => {
  assertTrue(vnode_isTextVNode(vNode), 'Expecting TextVNode was: ' + vnode_getNodeTypeName(vNode));
  return vNode as TextVNode;
};

const ensureElementOrVirtualVNode = (vNode: VNode) => {
  assertDefined(vNode, 'Missing vNode');
  assertTrue(
    (vNode.flags & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0,
    'Expecting ElementVNode or VirtualVNode was: ' + vnode_getNodeTypeName(vNode)
  );
};

export const ensureElementVNode = (vNode: VNode): ElementVNode => {
  assertTrue(
    vnode_isElementVNode(vNode),
    'Expecting ElementVNode was: ' + vnode_getNodeTypeName(vNode)
  );
  return vNode as ElementVNode;
};

export const vnode_getNodeTypeName = (vNode: VNode): string => {
  if (vNode) {
    const flags = vNode.flags;
    switch (flags & VNodeFlags.TYPE_MASK) {
      case VNodeFlags.Element:
        return 'Element';
      case VNodeFlags.Virtual:
        return 'Virtual';
      case VNodeFlags.Text:
        return 'Text';
    }
  }
  return '<unknown>';
};

/** @internal */
export const vnode_ensureElementInflated = (vnode: VNode) => {
  const flags = vnode.flags;
  if ((flags & VNodeFlags.INFLATED_TYPE_MASK) === VNodeFlags.Element) {
    const elementVNode = vnode as ElementVNode;
    elementVNode.flags ^= VNodeFlags.Inflated;
    const element = elementVNode.element;
    const attributes = element.attributes;
    for (let idx = 0; idx < attributes.length; idx++) {
      const attr = attributes[idx];
      const key = attr.name;
      if (key === Q_PROPS_SEPARATOR || !key) {
        // SVG in Domino does not support ':' so it becomes an empty string.
        // all attributes after the ':' are considered immutable, and so we ignore them.
        break;
      } else if (key.startsWith(QContainerAttr)) {
        const props = vnode_getProps(elementVNode);
        if (attr.value === QContainerValue.HTML) {
          mapArray_set(props, dangerouslySetInnerHTML, element.innerHTML, 0);
        } else if (attr.value === QContainerValue.TEXT && 'value' in element) {
          mapArray_set(props, 'value', element.value, 0);
        }
      } else if (!key.startsWith('on:')) {
        const value = attr.value;
        const props = vnode_getProps(elementVNode);
        mapArray_set(props, key, value, 0);
      }
    }
  }
};

/** Walks the VNode tree and materialize it using `vnode_getFirstChild`. */
export function vnode_walkVNode(
  vNode: VNode,
  callback?: (vNode: VNode, vParent: VNode | null) => boolean | void
): void {
  let vCursor: VNode | null = vNode;
  // Depth first traversal
  if (vnode_isTextVNode(vNode)) {
    // Text nodes don't have subscriptions or children;
    return;
  }
  let vParent: VNode | null = null;
  do {
    if (callback?.(vCursor, vParent)) {
      return;
    }
    const vFirstChild = vnode_getFirstChild(vCursor);
    if (vFirstChild) {
      vCursor = vFirstChild;
      continue;
    }
    // Out of children
    if (vCursor === vNode) {
      // we are where we started, this means that vNode has no children, so we are done.
      return;
    }
    // Out of children, go to next sibling
    const vNextSibling = vCursor.nextSibling as VNode | null;
    if (vNextSibling) {
      vCursor = vNextSibling;
      continue;
    }
    // Out of siblings, go to parent
    vParent = vCursor.parent;
    while (vParent) {
      if (vParent === vNode) {
        // We are back where we started, we are done.
        return;
      }
      const vNextParentSibling = vParent.nextSibling as VNode | null;
      if (vNextParentSibling) {
        vCursor = vNextParentSibling;
        break;
      }
      vParent = vParent.parent;
    }
    if (vParent == null) {
      // We are done.
      return;
    }
  } while (true as boolean);
}

export function vnode_getDOMChildNodes(
  journal: VNodeJournal,
  root: VNode,
  isVNode: true,
  childNodes?: (ElementVNode | TextVNode)[]
): (ElementVNode | TextVNode)[];
export function vnode_getDOMChildNodes(
  journal: VNodeJournal,
  root: VNode,
  isVNode?: false,
  childNodes?: (Element | Text)[]
): (Element | Text)[];
export function vnode_getDOMChildNodes(
  journal: VNodeJournal,
  root: VNode,
  isVNode: boolean = false,
  childNodes: (ElementVNode | TextVNode | Element | Text)[] = []
): (ElementVNode | TextVNode | Element | Text)[] {
  if (vnode_isElementOrTextVNode(root)) {
    if (vnode_isTextVNode(root)) {
      /**
       * If we are collecting text nodes, we need to ensure that they are inflated. If not inflated
       * we would return a single text node which represents many actual text nodes, or removing a
       * single text node would remove many text nodes.
       */
      vnode_ensureTextInflated(journal, root);
    }
    childNodes.push(isVNode ? root : vnode_getNode(root)!);
    return childNodes;
  }
  let vNode = vnode_getFirstChild(root);
  while (vNode) {
    if (vnode_isElementVNode(vNode)) {
      childNodes.push(isVNode ? vNode : vnode_getNode(vNode)!);
    } else if (vnode_isTextVNode(vNode)) {
      /**
       * If we are collecting text nodes, we need to ensure that they are inflated. If not inflated
       * we would return a single text node which represents many actual text nodes, or removing a
       * single text node would remove many text nodes.
       */
      vnode_ensureTextInflated(journal, vNode);
      childNodes.push(isVNode ? vNode : vnode_getNode(vNode)!);
    } else {
      isVNode
        ? vnode_getDOMChildNodes(journal, vNode, true, childNodes as (ElementVNode | TextVNode)[])
        : vnode_getDOMChildNodes(journal, vNode, false, childNodes as (Element | Text)[]);
    }
    vNode = vNode.nextSibling as VNode | null;
  }
  return childNodes;
}

/**
 * Returns the previous/next sibling but from the point of view of the DOM.
 *
 * Given:
 *
 * ```
 * <div>
 *   <>a</>
 *   <>
 *     <></>
 *     <>b</>
 *     <></>
 *   </>
 *   <>c</>
 * </div>
 * ```
 *
 * Then:
 *
 * - Next: if we start at `a` the next DOM sibling is `b`, than `c`.
 * - Previous: if we start at `c` the next DOM sibling is `b`, than `a`.
 *
 * @param vNode - Starting node
 * @param nextDirection - Direction to search true=next, false=previous
 * @param descend - If true, than we will descend into the children first.
 * @returns
 */
const vnode_getDomSibling = (
  vNode: VNode,
  nextDirection: boolean,
  descend: boolean
): ElementVNode | TextVNode | null => {
  const childProp = nextDirection ? 'firstChild' : 'lastChild';
  const siblingProp = nextDirection ? 'nextSibling' : 'previousSibling';
  let cursor: VNode | null = vNode;
  // first make sure we have a DOM node or no children.
  while (descend && cursor && vnode_isVirtualVNode(cursor)) {
    const child: VNode | null | undefined = cursor[childProp];
    if (!child) {
      break;
    }
    if (child.flags & VNodeFlags.ELEMENT_OR_TEXT_MASK) {
      return child as ElementVNode | TextVNode;
    }
    cursor = child;
  }
  while (cursor) {
    // Look at the previous/next sibling.
    let sibling: VNode | null | undefined = cursor[siblingProp];
    if (sibling && sibling.flags & VNodeFlags.ELEMENT_OR_TEXT_MASK) {
      // we found a previous/next DOM node, return it.
      return sibling as ElementVNode | TextVNode;
    } else if (!sibling) {
      // If we don't have a sibling than walk up the tree until you find one.
      let virtual: VNode | null | undefined = cursor.parent;
      if (virtual && !vnode_isVirtualVNode(virtual)) {
        return null;
      }
      while (virtual && !(sibling = virtual[siblingProp])) {
        virtual = virtual.parent;

        if (virtual && !vnode_isVirtualVNode(virtual)) {
          // the parent node is not virtual, so we are done here.
          return null;
        }
      }
      if (!sibling) {
        // If we did not find a sibling, than we are done.
        return null;
      }
      if (vnode_isTextVNode(sibling) && virtual && vnode_isElementVNode(virtual)) {
        // sibling to the real element is a text node, this is not a sibling
        return null;
      }
    }
    // At this point `sibling` is a next node to look at.
    // Next step is to descend until we find a DOM done.
    while (sibling) {
      cursor = sibling;
      if (cursor.flags & VNodeFlags.ELEMENT_OR_TEXT_MASK && vnode_getNode(cursor)) {
        // we have to check that we actually have a node, because it could be a text node which is
        // zero length and which does not have a representation in the DOM.
        return cursor as ElementVNode | TextVNode;
      }
      sibling = (cursor as VirtualVNode)[childProp];
    }
    // If we are here we did not find anything and we need to go up the tree again.
  }
  return null;
};

const vnode_ensureInflatedIfText = (journal: VNodeJournal, vNode: VNode): void => {
  if (vnode_isTextVNode(vNode)) {
    vnode_ensureTextInflated(journal, vNode);
  }
};

const vnode_ensureTextInflated = (journal: VNodeJournal, vnode: TextVNode) => {
  const textVNode = ensureTextVNode(vnode);
  const flags = textVNode.flags;
  if ((flags & VNodeFlags.Inflated) === 0) {
    const parentNode = vnode_getDomParent(vnode);
    assertDefined(parentNode, 'Missing parent node.');
    const sharedTextNode = textVNode.textNode as Text;
    const doc = parentNode.ownerDocument;
    // Walk the previous siblings and inflate them.
    let cursor = vnode_getDomSibling(vnode, false, true);
    // If text node is 0 length, than there is no text node.
    // In that case we use the next node as a reference, in which
    // case we know that the next node MUST be either NULL or an Element.
    const node = vnode_getDomSibling(vnode, true, true);
    const insertBeforeNode: Element | Text | null =
      sharedTextNode ||
      (((node instanceof ElementVNode ? node.element : node?.textNode) || null) as
        | Element
        | Text
        | null);

    let lastPreviousTextNode = insertBeforeNode;
    while (cursor && vnode_isTextVNode(cursor)) {
      if ((cursor.flags & VNodeFlags.Inflated) === 0) {
        const textNode = doc.createTextNode(cursor.text!);
        journal.push(VNodeJournalOpCode.Insert, parentNode, lastPreviousTextNode, textNode);
        lastPreviousTextNode = textNode;
        cursor.textNode = textNode;
        cursor.flags |= VNodeFlags.Inflated;
      }
      cursor = vnode_getDomSibling(cursor, false, true);
    }
    // Walk the next siblings and inflate them.
    cursor = vnode;
    while (cursor && vnode_isTextVNode(cursor)) {
      const next = vnode_getDomSibling(cursor, true, true);
      const isLastNode = next ? !vnode_isTextVNode(next) : true;
      if ((cursor.flags & VNodeFlags.Inflated) === 0) {
        if (isLastNode && sharedTextNode) {
          journal.push(VNodeJournalOpCode.SetText, sharedTextNode, cursor.text!);
        } else {
          const textNode = doc.createTextNode(cursor.text!);
          journal.push(VNodeJournalOpCode.Insert, parentNode, insertBeforeNode, textNode);
          cursor.textNode = textNode;
        }
        cursor.flags |= VNodeFlags.Inflated;
      }
      cursor = next;
    }
  }
};

export const vnode_locate = (rootVNode: ElementVNode, id: string | Element): VNode => {
  ensureElementVNode(rootVNode);
  let vNode: VNode | Element = rootVNode;
  const containerElement = rootVNode.element as ContainerElement;
  const { qVNodeRefs } = containerElement;
  let elementOffset: number = -1;
  let refElement: Element | VNode;
  if (typeof id === 'string') {
    assertDefined(qVNodeRefs, 'Missing qVNodeRefs.');
    elementOffset = parseInt(id);
    refElement = qVNodeRefs.get(elementOffset)!;
  } else {
    refElement = id;

    const vNode = (refElement as QElement).vNode;
    if (vNode) {
      return vNode;
    }
  }
  assertDefined(refElement, 'Missing refElement.');
  if (!vnode_isVNode(refElement)) {
    assertTrue(
      containerElement.contains(refElement),
      `Couldn't find the element inside the container while locating the VNode.`
    );
    // We need to find the vnode.
    let parent = refElement;
    const elementPath: Element[] = [refElement];
    while (parent && parent !== containerElement && !(parent as QElement).vNode) {
      parent = parent.parentElement!;
      elementPath.push(parent);
    }
    if ((parent as QElement).vNode) {
      vNode = (parent as QElement).vNode as ElementVNode;
    }
    // Start at rootVNode and follow the `elementPath` to find the vnode.
    for (let i = elementPath.length - 2; i >= 0; i--) {
      vNode = vnode_getVNodeForChildNode(vNode as ElementVNode, elementPath[i]);
    }

    if (elementOffset != -1) {
      (refElement as QElement).vNode = vNode;
      qVNodeRefs!.set(elementOffset, vNode as ElementVNode);
    }
  } else {
    vNode = refElement;
  }
  if (typeof id === 'string') {
    // process virtual node search.
    const idLength = id.length;
    let idx = indexOfAlphanumeric(id, idLength);
    let childIdx = 0;
    while (idx < idLength) {
      const ch = id.charCodeAt(idx);
      childIdx *= 26 /* a-z */;
      if (ch >= 97 /* a */) {
        // is lowercase
        childIdx += ch - 97 /* a */;
      } else {
        // is uppercase
        childIdx += ch - 65 /* A */;
        vNode = vnode_getChildWithIdx(vNode, childIdx);
        childIdx = 0;
      }
      idx++;
    }
  }
  return vNode;
};

const vnode_getChildWithIdx = (vNode: VNode, childIdx: number): VNode => {
  let child = vnode_getFirstChild(vNode);
  assertDefined(child, 'Missing child.');
  while (child.flags >>> VNodeFlagsIndex.shift !== childIdx) {
    child = child.nextSibling as VNode | null;
    assertDefined(child, 'Missing child.');
  }
  return child;
};

const vNodeStack: VNode[] = [];
export const vnode_getVNodeForChildNode = (
  vNode: ElementVNode,
  childElement: Element
): ElementVNode => {
  ensureElementVNode(vNode);
  let child = vnode_getFirstChild(vNode);
  assertDefined(child, 'Missing child.');
  while (child && (child instanceof ElementVNode ? child.element !== childElement : true)) {
    if (vnode_isVirtualVNode(child)) {
      const next = child.nextSibling as VNode | null;
      const firstChild = vnode_getFirstChild(child);
      if (firstChild) {
        next && vNodeStack.push(next);
        child = firstChild;
      } else {
        child = next || (vNodeStack.length ? vNodeStack.pop()! : null);
      }
    } else {
      const next = child.nextSibling as VNode | null;
      if (next) {
        child = next;
      } else {
        child = next || vNodeStack.pop()!;
      }
    }
    assertDefined(child, 'Missing child.');
  }
  while (vNodeStack.length) {
    vNodeStack.pop();
  }
  ensureElementVNode(child);
  assertEqual((child as ElementVNode).element, childElement, 'Child not found.');
  // console.log('FOUND', child[VNodeProps.node]?.outerHTML);
  return child as ElementVNode;
};

const indexOfAlphanumeric = (id: string, length: number): number => {
  let idx = 0;
  while (idx < length) {
    if (id.charCodeAt(idx) <= 57 /* 9 */) {
      idx++;
    } else {
      return idx;
    }
  }
  return length;
};

export const vnode_createErrorDiv = (
  document: Document,
  host: VNode,
  err: Error,
  journal: VNodeJournal
) => {
  const errorDiv = document.createElement('errored-host');
  if (err && err instanceof Error) {
    (errorDiv as any).props = { error: err };
  }
  errorDiv.setAttribute('q:key', '_error_');

  const vErrorDiv = vnode_newElement(errorDiv, 'errored-host');

  vnode_getDOMChildNodes(journal, host, true).forEach((child) => {
    vnode_insertBefore(journal, vErrorDiv, child, null);
  });
  return vErrorDiv;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_journalToString = (journal: VNodeJournal): string => {
  const lines = ['JOURNAL:'];
  let idx = 0;
  const length = journal.length;

  function stringify(...args: any[]) {
    lines.push(
      args
        .map((arg) => {
          if (typeof arg === 'string') {
            return arg;
          } else if (arg && isHtmlElement(arg)) {
            const html = arg.outerHTML;
            const hasChildNodes = !!arg.firstElementChild;
            const idx = html.indexOf('>');
            const lastIdx = html.lastIndexOf('<');
            return idx > 0 && hasChildNodes
              ? html.substring(0, idx + 1) + '...' + html.substring(lastIdx)
              : html;
          } else if (arg && isText(arg)) {
            return JSON.stringify(arg.nodeValue);
          } else {
            return String(arg);
          }
        })
        .join(' ')
    );
  }

  while (idx < length) {
    const op = journal[idx++] as VNodeJournalOpCode;
    switch (op) {
      case VNodeJournalOpCode.SetText:
        stringify('SetText');
        stringify('  ', journal[idx++]);
        stringify('   -->', journal[idx++]);
        break;
      case VNodeJournalOpCode.SetAttribute:
        stringify('SetAttribute');
        stringify('  ', journal[idx++]);
        stringify('   key', journal[idx++]);
        stringify('   val', journal[idx++]);
        break;
      case VNodeJournalOpCode.HoistStyles:
        stringify('HoistStyles');
        break;
      case VNodeJournalOpCode.Remove: {
        stringify('Remove');
        const parent = journal[idx++];
        stringify('  ', parent);
        let nodeToRemove: any;
        while (idx < length && typeof (nodeToRemove = journal[idx]) !== 'number') {
          stringify('   -->', nodeToRemove);
          idx++;
        }
        break;
      }
      case VNodeJournalOpCode.Insert: {
        stringify('Insert');
        const parent = journal[idx++];
        const insertBefore = journal[idx++];
        stringify('  ', parent);
        let newChild: any;
        while (idx < length && typeof (newChild = journal[idx]) !== 'number') {
          stringify('   -->', newChild);
          idx++;
        }
        if (insertBefore) {
          stringify('      ', insertBefore);
        }
        break;
      }
    }
  }
  lines.push('END JOURNAL');
  return lines.join('\n');
};

const parseBoolean = (value: string | boolean | null): boolean => {
  if (value === 'false') {
    return false;
  }
  return Boolean(value);
};

const isBooleanAttr = (element: Element, key: string): boolean => {
  const isBoolean =
    key == 'allowfullscreen' ||
    key == 'async' ||
    key == 'autofocus' ||
    key == 'autoplay' ||
    key == 'checked' ||
    key == 'controls' ||
    key == 'default' ||
    key == 'defer' ||
    key == 'disabled' ||
    key == 'formnovalidate' ||
    key == 'inert' ||
    key == 'ismap' ||
    key == 'itemscope' ||
    key == 'loop' ||
    key == 'multiple' ||
    key == 'muted' ||
    key == 'nomodule' ||
    key == 'novalidate' ||
    key == 'open' ||
    key == 'playsinline' ||
    key == 'readonly' ||
    key == 'required' ||
    key == 'reversed' ||
    key == 'selected';
  return isBoolean && key in element;
};

export const vnode_applyJournal = (journal: VNodeJournal) => {
  // console.log('APPLY JOURNAL', vnode_journalToString(journal));
  let idx = 0;
  const length = journal.length;
  while (idx < length) {
    const op = journal[idx++] as VNodeJournalOpCode;
    switch (op) {
      case VNodeJournalOpCode.SetText:
        const text = journal[idx++] as Text;
        text.nodeValue = journal[idx++] as string;
        break;
      case VNodeJournalOpCode.SetAttribute:
        const element = journal[idx++] as Element;
        let key = journal[idx++] as string;
        if (key === 'className') {
          key = 'class';
        }
        const value = journal[idx++] as string | null | boolean;
        if (isBooleanAttr(element, key)) {
          (element as any)[key] = parseBoolean(value);
        } else if (key === 'value' && key in element) {
          (element as any).value = String(value);
        } else if (key === dangerouslySetInnerHTML) {
          (element as any).innerHTML = value!;
          element.setAttribute(QContainerAttr, QContainerValue.HTML);
        } else {
          if (value == null || value === false) {
            element.removeAttribute(key);
          } else {
            element.setAttribute(key, String(value));
          }
        }
        break;
      case VNodeJournalOpCode.HoistStyles:
        const document = journal[idx++] as Document;
        const head = document.head;
        const styles = document.querySelectorAll(QStylesAllSelector);
        for (let i = 0; i < styles.length; i++) {
          head.appendChild(styles[i]);
        }
        break;
      case VNodeJournalOpCode.Remove:
        const removeParent = journal[idx++] as Element;
        let nodeToRemove: any;
        while (idx < length && typeof (nodeToRemove = journal[idx]) !== 'number') {
          removeParent.removeChild(nodeToRemove as Element | Text);
          idx++;
        }
        break;
      case VNodeJournalOpCode.RemoveAll:
        const removeAllParent = journal[idx++] as Element;
        if (removeAllParent.replaceChildren) {
          removeAllParent.replaceChildren();
        } else {
          // fallback if replaceChildren is not supported
          removeAllParent.textContent = '';
        }
        break;
      case VNodeJournalOpCode.Insert:
        const insertParent = journal[idx++] as Element;
        const insertBefore = journal[idx++] as Element | Text | null;
        let newChild: any;
        while (idx < length && typeof (newChild = journal[idx]) !== 'number') {
          insertParent.insertBefore(newChild, insertBefore);
          idx++;
        }
        break;
    }
  }
  journal.length = 0;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_insertBefore = (
  journal: VNodeJournal,
  parent: ElementVNode | VirtualVNode,
  newChild: VNode,
  insertBefore: VNode | null
) => {
  ensureElementOrVirtualVNode(parent);
  if (vnode_isElementVNode(parent)) {
    ensureMaterialized(parent);
  }
  const newChildCurrentParent = newChild.parent;
  if (newChild === insertBefore) {
    // invalid insertBefore. We can't insert before self reference
    // prevent infinity loop and putting self reference to next sibling
    if (newChildCurrentParent) {
      // early return, as the newChild is already in the tree and we are already in the correct position
      return;
    } else {
      // if the newChild is not in the tree, than we insert it at the end of the list
      insertBefore = null;
    }
  }

  /**
   * Find the parent node and the dom children with the correct namespaces before we unlink the
   * previous node. If we don't do this, we will end up with situations where we inflate text nodes
   * from shared text node not correctly.
   *
   * Example:
   *
   * ```
   * <Component>
   *   <Projection>a</Projection>
   *   <Projection>b</Projection>
   * </Component>
   * ```
   *
   * Projection nodes are virtual nodes, so they don't have a dom parent. They will be written to
   * the q:template element if not visible at the start. Inside the q:template element, the
   * projection nodes will be streamed as single text node "ab". We need to split it, but if we
   * unlink the previous or next sibling, we don't know that after "a" node is "b". So we need to
   * find children first (and inflate them).
   */
  const domParentVNode = vnode_getDomParentVNode(parent, false);
  const parentNode = domParentVNode && domParentVNode.element;
  let domChildren: (Element | Text)[] | null = null;
  if (domParentVNode) {
    domChildren = vnode_getDomChildrenWithCorrectNamespacesToInsert(
      journal,
      domParentVNode,
      newChild
    );
  }

  /**
   * Ensure that the previous node is unlinked.
   *
   * We need to do it before finding the adjustedInsertBefore. The problem is when you try to render
   * the same projection multiple times in the same node but under different conditions. We reuse
   * projection nodes, so when this happens, we can end up with a situation where the node is
   * inserted before node above it.
   *
   * Example:
   *
   * ```
   * <>
   *   {props.toggle && <Slot />}
   *   {!props.toggle && (
   *     <>
   *       <Slot />
   *     </>
   *   )}
   * </>
   * ```
   *
   * Projected content:
   *
   * ```
   * <h1>Test</h1>
   * <p>Test content</p>
   * ```
   *
   * If we don't unlink the previous node, we will end up at some point with the following:
   *
   * ```
   * <h1>Test</h1>
   * <p>Test content</p> // <-- inserted before the first h1
   * <h1>Test</h1> // <-- to remove, but still in the tree
   * <p>Test content</p> // <-- to remove
   * ```
   */
  if (
    newChildCurrentParent &&
    (newChild.previousSibling || newChild.nextSibling || newChildCurrentParent !== parent)
  ) {
    vnode_remove(journal, newChildCurrentParent, newChild, false);
  }

  const parentIsDeleted = parent.flags & VNodeFlags.Deleted;

  // if the parent is deleted, then we don't need to insert the new child
  if (!parentIsDeleted) {
    let adjustedInsertBefore: VNode | null = null;
    if (insertBefore == null) {
      if (vnode_isVirtualVNode(parent)) {
        // If `insertBefore` is null, than we need to insert at the end of the list.
        // Well, not quite. If the parent is a virtual node, our "last node" is not the same
        // as the DOM "last node". So in that case we need to look for the "next node" from
        // our parent.
        adjustedInsertBefore = vnode_getDomSibling(parent, true, false);
      }
    } else if (vnode_isVirtualVNode(insertBefore)) {
      // If the `insertBefore` is virtual, than we need to descend into the virtual and find e actual
      adjustedInsertBefore = vnode_getDomSibling(insertBefore, true, true);
    } else {
      adjustedInsertBefore = insertBefore;
    }
    adjustedInsertBefore && vnode_ensureInflatedIfText(journal, adjustedInsertBefore);

    // Here we know the insertBefore node
    if (domChildren && domChildren.length) {
      journal.push(
        VNodeJournalOpCode.Insert,
        parentNode,
        vnode_getNode(adjustedInsertBefore),
        ...domChildren
      );
    }
  }

  // link newChild into the previous/next list
  const vNext = insertBefore;
  const vPrevious = vNext ? vNext.previousSibling : (parent.lastChild as VNode | null);
  if (vNext) {
    vNext.previousSibling = newChild;
  } else {
    parent.lastChild = newChild;
  }
  if (vPrevious) {
    vPrevious.nextSibling = newChild;
  } else {
    parent.firstChild = newChild;
  }
  newChild.previousSibling = vPrevious;
  newChild.nextSibling = vNext;
  newChild.parent = parent;
  if (parentIsDeleted) {
    // if the parent is deleted, then the new child is also deleted
    newChild.flags |= VNodeFlags.Deleted;
  }
};

export const vnode_getDomParent = (
  vnode: VNode,
  includeProjection = true
): Element | Text | null => {
  vnode = vnode_getDomParentVNode(vnode, includeProjection) as VNode;
  return (vnode && (vnode as ElementVNode).element) as Element | Text | null;
};

export const vnode_getDomParentVNode = (
  vnode: VNode,
  includeProjection = true
): ElementVNode | null => {
  while (vnode && !vnode_isElementVNode(vnode)) {
    vnode = vnode.parent || (includeProjection ? vnode.slotParent : null)!;
  }
  return vnode;
};

export const vnode_remove = (
  journal: VNodeJournal,
  vParent: ElementVNode | VirtualVNode,
  vToRemove: VNode,
  removeDOM: boolean
) => {
  assertEqual(vParent, vToRemove.parent, 'Parent mismatch.');
  if (vnode_isTextVNode(vToRemove)) {
    vnode_ensureTextInflated(journal, vToRemove);
  }

  if (removeDOM) {
    const domParent = vnode_getDomParent(vParent, false);
    const isInnerHTMLParent = vParent.getAttr(dangerouslySetInnerHTML);
    if (isInnerHTMLParent) {
      // ignore children, as they are inserted via innerHTML
      return;
    }
    const children = vnode_getDOMChildNodes(journal, vToRemove);
    domParent && children.length && journal.push(VNodeJournalOpCode.Remove, domParent, ...children);
  }

  const vPrevious = vToRemove.previousSibling;
  const vNext = vToRemove.nextSibling;
  if (vPrevious) {
    vPrevious.nextSibling = vNext;
  } else {
    vParent.firstChild = vNext;
  }
  if (vNext) {
    vNext.previousSibling = vPrevious;
  } else {
    vParent.lastChild = vPrevious;
  }
  vToRemove.previousSibling = null;
  vToRemove.nextSibling = null;
};

export const vnode_queryDomNodes = (
  vNode: VNode,
  selector: string,
  cb: (element: Element) => void
) => {
  if (vnode_isElementVNode(vNode)) {
    const element = vnode_getNode(vNode) as HTMLElement;
    if (element.matches(selector)) {
      cb(element);
    } else {
      element.querySelectorAll(selector).forEach(cb);
    }
  } else {
    let child = vnode_getFirstChild(vNode);
    while (child) {
      vnode_queryDomNodes(child, selector, cb);
      child = child.nextSibling as VNode | null;
    }
  }
};

export const vnode_truncate = (
  journal: VNodeJournal,
  vParent: ElementVNode | VirtualVNode,
  vDelete: VNode
) => {
  assertDefined(vDelete, 'Missing vDelete.');
  const parent = vnode_getDomParent(vParent);
  if (parent) {
    if (vnode_isElementVNode(vParent)) {
      journal.push(VNodeJournalOpCode.RemoveAll, parent);
    } else {
      const children = vnode_getDOMChildNodes(journal, vParent);
      children.length && journal.push(VNodeJournalOpCode.Remove, parent, ...children);
    }
  }
  const vPrevious = vDelete.previousSibling;
  if (vPrevious) {
    vPrevious.nextSibling = null;
  } else {
    vParent.firstChild = null;
  }
  vParent.lastChild = vPrevious;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_getElementName = (vnode: ElementVNode): string => {
  const elementVNode = ensureElementVNode(vnode);
  let elementName = elementVNode.elementName;
  if (elementName === undefined) {
    const element = elementVNode.element;
    const nodeName = fastNodeName(element)!.toLowerCase();
    elementName = elementVNode.elementName = nodeName;
    elementVNode.flags |= vnode_getElementNamespaceFlags(element);
  }
  return elementName;
};

export const vnode_getText = (textVNode: TextVNode): string => {
  let text = textVNode.text;
  if (text === undefined) {
    text = textVNode.text = textVNode.textNode!.nodeValue!;
  }
  return text;
};

export const vnode_setText = (journal: VNodeJournal, textVNode: TextVNode, text: string) => {
  vnode_ensureTextInflated(journal, textVNode);
  const textNode = textVNode.textNode!;
  journal.push(VNodeJournalOpCode.SetText, textNode, (textVNode.text = text));
};

/** @internal */
export const vnode_getFirstChild = (vnode: VNode): VNode | null => {
  if (vnode_isTextVNode(vnode)) {
    return null;
  }
  let vFirstChild = (vnode as ElementVNode | VirtualVNode).firstChild;
  if (vFirstChild === undefined) {
    vFirstChild = ensureMaterialized(vnode as ElementVNode);
  }
  return vFirstChild;
};

const vnode_materialize = (vNode: ElementVNode) => {
  const element = vNode.element;
  const firstChild = fastFirstChild(element);
  const vNodeData = (element.ownerDocument as QDocument)?.qVNodeData?.get(element);

  const vFirstChild = materialize(vNode, element, firstChild, vNodeData);
  return vFirstChild;
};

const materialize = (
  vNode: ElementVNode,
  element: Element,
  firstChild: Node | null,
  vNodeData?: string
): VNode | null => {
  if (vNodeData) {
    if (vNodeData.charCodeAt(0) === VNodeDataChar.SEPARATOR) {
      /**
       * If vNodeData start with the `VNodeDataChar.SEPARATOR` then it means that the vNodeData
       * contains some data for DOM element. We need to split it to DOM element vNodeData and
       * virtual element vNodeData.
       *
       * For example `|=6`4|2{J=7`3|q:type|S}` should split into `=6`4`and`2{J=7`3|q:type|S}`, where
       * `=6`4` is vNodeData for the DOM element.
       */

      const elementVNodeDataStartIdx = 1;
      let elementVNodeDataEndIdx = 1;
      while (vNodeData.charCodeAt(elementVNodeDataEndIdx) !== VNodeDataChar.SEPARATOR) {
        elementVNodeDataEndIdx++;
      }
      const elementVNodeData = vNodeData.substring(
        elementVNodeDataStartIdx,
        elementVNodeDataEndIdx
      );

      // Override vNodeData variable for materializing a virtual element
      vNodeData = vNodeData.substring(elementVNodeDataEndIdx + 1);

      // Materialize DOM element from HTML. If the `vNodeData` is not empty,
      // then also materialize virtual element from vNodeData
      const vFirstChild = materializeFromDOM(vNode, firstChild, elementVNodeData);
      if (!vNodeData) {
        //  If it is empty then we don't need to call the `materializeFromVNodeData`.
        return vFirstChild;
      }
    }
    // Materialize virtual element form vNodeData
    return materializeFromVNodeData(vNode, vNodeData, element, firstChild);
  } else {
    // Materialize DOM element from HTML only
    return materializeFromDOM(vNode, firstChild);
  }
};

export const ensureMaterialized = (vnode: ElementVNode): VNode | null => {
  const vParent = ensureElementVNode(vnode);
  let vFirstChild = vParent.firstChild;
  if (vFirstChild === undefined) {
    // need to materialize the vNode.
    const element = vParent.element;

    if (vParent.parent && shouldIgnoreChildren(element)) {
      // We have a container with html value, must ignore the content.
      vFirstChild = vParent.firstChild = vParent.lastChild = null;
    } else {
      vFirstChild = vnode_materialize(vParent);
    }
  }
  assertTrue(vParent.firstChild !== undefined, 'Did not materialize.');
  assertTrue(vParent.lastChild !== undefined, 'Did not materialize.');
  return vFirstChild;
};

let _fastHasAttribute: ((this: Element, key: string) => boolean) | null = null;
export const shouldIgnoreChildren = (node: Element): boolean => {
  if (!_fastHasAttribute) {
    _fastHasAttribute = node.hasAttribute;
  }
  return _fastHasAttribute.call(node, QContainerAttr);
};

let _fastNodeType: ((this: Node) => number) | null = null;
const fastNodeType = (node: Node): number => {
  if (!_fastNodeType) {
    _fastNodeType = fastGetter<typeof _fastNodeType>(node, 'nodeType')!;
  }
  return _fastNodeType.call(node);
};
const fastIsTextOrElement = (node: Node): boolean => {
  const type = fastNodeType(node);
  return type === /* Node.TEXT_NODE */ 3 || type === /* Node.ELEMENT_NODE */ 1;
};

let _fastNextSibling: ((this: Node) => Node | null) | null = null;
export const fastNextSibling = (node: Node | null): Node | null => {
  if (!_fastNextSibling) {
    _fastNextSibling = fastGetter<typeof _fastNextSibling>(node, 'nextSibling')!;
  }
  if (!_fastFirstChild) {
    _fastFirstChild = fastGetter<typeof _fastFirstChild>(node, 'firstChild')!;
  }
  while (node) {
    node = _fastNextSibling.call(node);
    if (node !== null) {
      const type = fastNodeType(node);
      if (type === /* Node.TEXT_NODE */ 3 || type === /* Node.ELEMENT_NODE */ 1) {
        break;
      } else if (type === /* Node.COMMENT_NODE */ 8) {
        const nodeValue = node.nodeValue;
        if (nodeValue?.startsWith(QIgnore)) {
          return getNodeAfterCommentNode(node, QContainerIsland, _fastNextSibling, _fastFirstChild);
        } else if (node.nodeValue?.startsWith(QContainerIslandEnd)) {
          return getNodeAfterCommentNode(node, QIgnoreEnd, _fastNextSibling, _fastFirstChild);
        } else if (nodeValue?.startsWith(QContainerAttr)) {
          while (node && (node = _fastNextSibling.call(node))) {
            if (
              fastNodeType(node) === /* Node.COMMENT_NODE */ 8 &&
              node.nodeValue?.startsWith(QContainerAttrEnd)
            ) {
              break;
            }
          }
        }
      }
    }
  }
  return node;
};

function getNodeAfterCommentNode(
  node: Node | null,
  commentValue: string,
  nextSibling: NonNullable<typeof _fastNextSibling>,
  firstChild: NonNullable<typeof _fastFirstChild>
): Node | null {
  while (node) {
    if (node.nodeValue?.startsWith(commentValue)) {
      node = nextSibling.call(node) || null;
      return node;
    }

    let nextNode: Node | null = firstChild.call(node);
    if (!nextNode) {
      nextNode = nextSibling.call(node);
    }
    if (!nextNode) {
      nextNode = fastParentNode(node);
      if (nextNode) {
        nextNode = nextSibling.call(nextNode);
      }
    }
    node = nextNode;
  }
  return null;
}

let _fastParentNode: ((this: Node) => Node | null) | null = null;
const fastParentNode = (node: Node): Node | null => {
  if (!_fastParentNode) {
    _fastParentNode = fastGetter<typeof _fastParentNode>(node, 'parentNode')!;
  }
  return _fastParentNode.call(node);
};

let _fastFirstChild: ((this: Node) => Node | null) | null = null;
const fastFirstChild = (node: Node | null): Node | null => {
  if (!_fastFirstChild) {
    _fastFirstChild = fastGetter<typeof _fastFirstChild>(node, 'firstChild')!;
  }
  node = node && _fastFirstChild.call(node);
  while (node && !fastIsTextOrElement(node)) {
    node = fastNextSibling(node);
  }
  return node;
};

let _fastNamespaceURI: ((this: Element) => string | null) | null = null;
export const fastNamespaceURI = (element: Element): string | null => {
  if (!_fastNamespaceURI) {
    _fastNamespaceURI = fastGetter<typeof _fastNamespaceURI>(element, 'namespaceURI')!;
  }
  return _fastNamespaceURI.call(element);
};

let _fastNodeName: ((this: Element) => string | null) | null = null;
export const fastNodeName = (element: Element): string | null => {
  if (!_fastNodeName) {
    _fastNodeName = fastGetter<typeof _fastNodeName>(element, 'nodeName')!;
  }
  return _fastNodeName.call(element);
};

const fastGetter = <T>(prototype: any, name: string): T => {
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

const hasQStyleAttribute = (element: Element): boolean => {
  return (
    element.nodeName === 'STYLE' &&
    (element.hasAttribute(QScopedStyle) || element.hasAttribute(QStyle))
  );
};

const hasPropsSeparator = (element: Element): boolean => {
  return element.hasAttribute(Q_PROPS_SEPARATOR);
};

const materializeFromDOM = (vParent: ElementVNode, firstChild: Node | null, vData?: string) => {
  let vFirstChild: VNode | null = null;

  const skipElements = () => {
    while (isElement(child) && shouldSkipElement(child)) {
      child = fastNextSibling(child);
    }
  };
  // materialize from DOM
  let child = firstChild;
  skipElements();
  let vChild: VNode | null = null;
  while (child) {
    const nodeType = fastNodeType(child);
    let vNextChild: VNode | null = null;
    if (nodeType === /* Node.TEXT_NODE */ 3) {
      vNextChild = vnode_newText(child as Text, child.textContent ?? undefined);
    } else if (nodeType === /* Node.ELEMENT_NODE */ 1) {
      vNextChild = vnode_newUnMaterializedElement(child as Element);
    }
    if (vNextChild) {
      vNextChild.parent = vParent;
      vChild && (vChild.nextSibling = vNextChild);
      vNextChild.previousSibling = vChild;
      vChild = vNextChild;
    }
    if (!vFirstChild) {
      vParent.firstChild = vFirstChild = vChild;
    }
    child = fastNextSibling(child);
    skipElements();
  }
  vParent.lastChild = vChild || null;
  vParent.firstChild = vFirstChild;

  if (vData) {
    /**
     * If we need to materialize from DOM and we have vNodeData it means that we have some virtual
     * props for that node.
     */
    let container: ClientContainer | null = null;
    processVNodeData(vData, (peek, consumeValue) => {
      if (peek() === VNodeDataChar.ID) {
        if (!container) {
          container = getDomContainer(vParent.element);
        }
        const id = consumeValue();
        container.$setRawState$(parseInt(id), vParent);
        isDev && vParent.setAttr(ELEMENT_ID, id, null);
      } else if (peek() === VNodeDataChar.BACK_REFS) {
        if (!container) {
          container = getDomContainer(vParent.element);
        }
        setEffectBackRefFromVNodeData(vParent, consumeValue(), container);
      } else {
        // prevent infinity loop if there are some characters outside the range
        consumeValue();
      }
    });
  }

  return vFirstChild;
};

function setEffectBackRefFromVNodeData(
  vParent: VNode,
  value: string | number,
  container: ClientContainer
) {
  if (!(vParent as any)[_EFFECT_BACK_REF]) {
    // get data lazily
    // this is because effects back refs can point to vnodes which are not yet materialized
    // (are after the current vnode)
    Object.defineProperty(vParent, _EFFECT_BACK_REF, {
      get() {
        const subMap = container.$getObjectById$(value);
        (vParent as any)[_EFFECT_BACK_REF] = subMap;
        return subMap;
      },
      set(value: unknown) {
        Object.defineProperty(vParent, _EFFECT_BACK_REF, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
      enumerable: true,
      configurable: true,
    });
  } else {
    const subMap = (vParent as any)[_EFFECT_BACK_REF];
    mergeMaps(subMap, container.$getObjectById$(value));
  }
}

const processVNodeData = (
  vData: string,
  callback: (
    peek: () => number,
    consumeValue: () => string,
    consume: () => number,
    getChar: (idx: number) => number,
    nextToConsumeIdx: number
  ) => void
) => {
  let nextToConsumeIdx = 0;
  let ch = 0;
  let peekCh = 0;
  const getChar = (idx: number) => {
    return idx < vData.length ? vData.charCodeAt(idx) : 0;
  };
  const peek = () => {
    if (peekCh !== 0) {
      return peekCh;
    } else {
      return (peekCh = getChar(nextToConsumeIdx));
    }
  };
  const consume = () => {
    ch = peek();
    peekCh = 0;
    nextToConsumeIdx++;
    return ch;
  };

  const consumeValue = () => {
    consume();
    const start = nextToConsumeIdx;
    while (
      (peek() <= 58 /* `:` */ && peekCh !== 0) ||
      peekCh === 95 /* `_` */ ||
      (peekCh >= 65 /* `A` */ && peekCh <= 90) /* `Z` */ ||
      (peekCh >= 97 /* `a` */ && peekCh <= 122) /* `z` */
    ) {
      consume();
    }
    return vData.substring(start, nextToConsumeIdx);
  };

  while (peek() !== 0) {
    callback(peek, consumeValue, consume, getChar, nextToConsumeIdx);
  }
};

/** @internal */
export const vnode_getNextSibling = (vnode: VNode): VNode | null => {
  return vnode.nextSibling as VNode | null;
};

export const vnode_getPreviousSibling = (vnode: VNode): VNode | null => {
  return vnode.previousSibling as VNode | null;
};

/** @internal */
export const vnode_getAttrKeys = (vnode: ElementVNode | VirtualVNode): string[] => {
  const type = vnode.flags;
  if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
    vnode_ensureElementInflated(vnode);
    const keys: string[] = [];
    const props = vnode_getProps(vnode);
    for (let i = 0; i < props.length; i = i + 2) {
      const key = props[i] as string;
      if (!key.startsWith(Q_PROPS_SEPARATOR)) {
        keys.push(key);
      }
    }
    return keys;
  }
  return [];
};

/** @internal */
export const vnode_getProps = (vnode: ElementVNode | VirtualVNode): unknown[] => {
  vnode.props ||= [];
  return vnode.props;
};

export const vnode_isDescendantOf = (vnode: VNode, ancestor: VNode): boolean => {
  let parent: VNode | null = vnode_getProjectionParentOrParent(vnode);
  while (parent) {
    if (parent === ancestor) {
      return true;
    }
    parent = vnode_getProjectionParentOrParent(parent);
  }
  return false;
};

export const vnode_getProjectionParentOrParent = (vnode: VNode): VNode | null => {
  return vnode.slotParent || vnode.parent;
};

export const vnode_getNode = (vnode: VNode | null): Element | Text | null => {
  if (vnode === null || vnode_isVirtualVNode(vnode)) {
    return null;
  }
  if (vnode_isElementVNode(vnode)) {
    return vnode.element;
  }
  assertTrue(vnode_isTextVNode(vnode), 'Expecting Text Node.');
  return (vnode as TextVNode).textNode!;
};

/** @internal */
export function vnode_toString(
  this: VNode | null,
  depth: number = 20,
  offset: string = '',
  materialize: boolean = false,
  siblings = false,
  colorize: boolean = true
): string {
  let vnode = this;
  if (depth === 0) {
    return '...';
  }
  if (vnode === null) {
    return 'null';
  }
  if (vnode === undefined) {
    return 'undefined';
  }
  const strings: string[] = [];
  const NAME_COL_PREFIX = '\x1b[34m';
  const NAME_COL_SUFFIX = '\x1b[0m';
  do {
    if (vnode_isTextVNode(vnode)) {
      strings.push(qwikDebugToString(vnode_getText(vnode)));
    } else if (vnode_isVirtualVNode(vnode)) {
      const idx = vnode.flags >>> VNodeFlagsIndex.shift;
      const attrs: string[] = ['[' + String(idx) + ']'];
      vnode_getAttrKeys(vnode).forEach((key) => {
        if (key !== DEBUG_TYPE) {
          const value = vnode!.getAttr(key);
          attrs.push(' ' + key + '=' + qwikDebugToString(value));
        }
      });
      const name =
        (colorize ? NAME_COL_PREFIX : '') +
        (VirtualTypeName[vnode.getAttr(DEBUG_TYPE) || VirtualType.Virtual] ||
          VirtualTypeName[VirtualType.Virtual]) +
        (colorize ? NAME_COL_SUFFIX : '');
      strings.push('<' + name + attrs.join('') + '>');
      const child = vnode_getFirstChild(vnode);
      child &&
        strings.push(
          '  ' + vnode_toString.call(child, depth - 1, offset + '  ', true, true, colorize)
        );
      strings.push('</' + name + '>');
    } else if (vnode_isElementVNode(vnode)) {
      const tag = vnode_getElementName(vnode);
      const attrs: string[] = [];
      const keys = vnode_getAttrKeys(vnode);
      keys.forEach((key) => {
        const value = vnode!.getAttr(key);
        attrs.push(' ' + key + '=' + qwikDebugToString(value));
      });
      const node = vnode_getNode(vnode) as HTMLElement;
      if (node) {
        const vnodeData = (node.ownerDocument as QDocument).qVNodeData?.get(node);
        if (vnodeData) {
          attrs.push(' q:vnodeData=' + qwikDebugToString(vnodeData));
        }
      }
      const domAttrs = node.attributes;
      for (let i = 0; i < domAttrs.length; i++) {
        const attr = domAttrs[i];
        if (keys.indexOf(attr.name) === -1) {
          attrs.push(' ' + attr.name + (attr.value ? '=' + qwikDebugToString(attr.value) : ''));
        }
      }
      strings.push('<' + tag + attrs.join('') + '>');
      if (vnode_isMaterialized(vnode) || materialize) {
        const child = vnode_getFirstChild(vnode);
        child &&
          strings.push(
            '  ' + vnode_toString.call(child, depth - 1, offset + '  ', true, true, colorize)
          );
      } else {
        strings.push('  <!-- not materialized --!>');
      }
      strings.push('</' + tag + '>');
    }
    vnode = (siblings && vnode.nextSibling) || null;
  } while (vnode);
  return strings.join('\n' + offset);
}

const isNumber = (ch: number) => /* `0` */ 48 <= ch && ch <= 57; /* `9` */
const isLowercase = (ch: number) => /* `a` */ 97 <= ch && ch <= 122; /* `z` */

function shouldSkipElement(element: Element) {
  return (
    // Skip over elements that don't have a props separator. They are not rendered by Qwik.
    !hasPropsSeparator(element) ||
    // We pretend that style element's don't exist as they can get moved out.
    // skip over style elements, as those need to be moved to the head
    // and are not included in the counts.
    hasQStyleAttribute(element)
  );
}

const stack: any[] = [];
function materializeFromVNodeData(
  vParent: ElementVNode | VirtualVNode,
  vData: string,
  element: Element,
  child: Node | null
): VNode {
  let idx = 0;
  let vFirst: VNode | null = null;
  let vLast: VNode | null = null;
  let previousTextNode: TextVNode | null = null;

  const addVNode = (node: VNode) => {
    node.flags = (node.flags & VNodeFlagsIndex.mask) | (idx << VNodeFlagsIndex.shift);
    idx++;
    vLast && (vLast.nextSibling = node);
    node.previousSibling = vLast;
    node.parent = vParent;
    if (!vFirst) {
      vParent.firstChild = vFirst = node;
    }
    vLast = node;
  };

  let textIdx = 0;
  let combinedText: string | null = null;
  let container: ClientContainer | null = null;

  const shouldSkipNode = (node: Node | null) => {
    const nodeIsElement = isElement(node);
    return !nodeIsElement || (nodeIsElement && shouldSkipElement(node));
  };

  processVNodeData(vData, (peek, consumeValue, consume, getChar, nextToConsumeIdx) => {
    if (isNumber(peek())) {
      // Element counts get encoded as numbers.
      while (shouldSkipNode(child)) {
        child = fastNextSibling(child);
        if (!child) {
          throw qError(QError.materializeVNodeDataError, [vData, peek(), nextToConsumeIdx]);
        }
      }
      combinedText = null;
      previousTextNode = null;
      let value = 0;
      while (isNumber(peek())) {
        value *= 10;
        value += consume() - 48; /* `0` */
      }
      while (value--) {
        addVNode(vnode_newUnMaterializedElement(child as Element));
        child = fastNextSibling(child);
      }
      // collect the elements;
    } else if (peek() === VNodeDataChar.SCOPED_STYLE) {
      vParent.setAttr(QScopedStyle, consumeValue(), null);
    } else if (peek() === VNodeDataChar.RENDER_FN) {
      vParent.setAttr(OnRenderProp, consumeValue(), null);
    } else if (peek() === VNodeDataChar.ID) {
      if (!container) {
        container = getDomContainer(element);
      }
      const id = consumeValue();
      container.$setRawState$(parseInt(id), vParent);
      isDev && vParent.setAttr(ELEMENT_ID, id, null);
    } else if (peek() === VNodeDataChar.PROPS) {
      vParent.setAttr(ELEMENT_PROPS, consumeValue(), null);
    } else if (peek() === VNodeDataChar.KEY) {
      const isEscapedValue = getChar(nextToConsumeIdx + 1) === VNodeDataChar.SEPARATOR;
      let value;
      if (isEscapedValue) {
        consume();
        value = decodeURI(consumeValue());
        consume();
      } else {
        value = consumeValue();
      }
      vParent.setAttr(ELEMENT_KEY, value, null);
    } else if (peek() === VNodeDataChar.SEQ) {
      vParent.setAttr(ELEMENT_SEQ, consumeValue(), null);
    } else if (peek() === VNodeDataChar.SEQ_IDX) {
      vParent.setAttr(ELEMENT_SEQ_IDX, consumeValue(), null);
    } else if (peek() === VNodeDataChar.BACK_REFS) {
      if (!container) {
        container = getDomContainer(element);
      }
      setEffectBackRefFromVNodeData(vParent, consumeValue(), container);
    } else if (peek() === VNodeDataChar.SLOT_PARENT) {
      if (!container) {
        container = getDomContainer(element);
      }
      vParent.slotParent = vnode_locate(container!.rootVNode, consumeValue());
    } else if (peek() === VNodeDataChar.CONTEXT) {
      vParent.setAttr(QCtxAttr, consumeValue(), null);
    } else if (peek() === VNodeDataChar.OPEN) {
      consume();
      addVNode(vnode_newVirtual());
      stack.push(vParent, vFirst, vLast, previousTextNode, idx);
      idx = 0;
      vParent = vLast as ElementVNode | VirtualVNode;
      vFirst = vLast = null;
    } else if (peek() === VNodeDataChar.SEPARATOR) {
      const key = consumeValue();
      const value = consumeValue();
      vParent.setAttr(key, value, null);
    } else if (peek() === VNodeDataChar.CLOSE) {
      consume();
      vParent.lastChild = vLast;
      idx = stack.pop();
      previousTextNode = stack.pop();
      vLast = stack.pop();
      vFirst = stack.pop();
      vParent = stack.pop();
    } else if (peek() === VNodeDataChar.SLOT) {
      vParent.setAttr(QSlot, consumeValue(), null);
    } else {
      // skip over style or non-qwik elements in front of text nodes, where text node is the first child (except the style node)
      while (isElement(child) && shouldSkipElement(child)) {
        child = fastNextSibling(child);
      }
      const textNode =
        child && fastNodeType(child) === /* Node.TEXT_NODE */ 3 ? (child as Text) : null;
      // must be alphanumeric
      if (combinedText === null) {
        combinedText = textNode ? textNode.nodeValue : null;
        textIdx = 0;
      }
      let length = 0;
      while (isLowercase(peek())) {
        length += consume() - 97; /* `a` */
        length *= 26;
      }
      length += consume() - 65; /* `A` */
      const text = combinedText === null ? '' : combinedText.substring(textIdx, textIdx + length);

      addVNode(
        (previousTextNode = vnode_newSharedText(previousTextNode, textNode as Text | null, text))
      );
      textIdx += length;
      // Text nodes get encoded as alphanumeric characters.
    }
  });
  vParent.lastChild = vLast;
  return vFirst!;
}

export const vnode_getType = (vnode: VNode): 1 | 3 | 11 => {
  const type = vnode.flags;
  if (type & VNodeFlags.Element) {
    return 1 /* Element */;
  } else if (type & VNodeFlags.Virtual) {
    return 11 /* Virtual */;
  } else if (type & VNodeFlags.Text) {
    return 3 /* Text */;
  }
  throw qError(QError.invalidVNodeType, [type]);
};

const isElement = (node: any): node is Element =>
  node && typeof node == 'object' && fastNodeType(node) === /** Node.ELEMENT_NODE* */ 1;

/**
 * Use this method to find the parent component for projection.
 *
 * Normally the parent component is just the first component which we encounter while traversing the
 * parents.
 *
 * However, if during traversal we encounter a projection, than we have to follow the projection,
 * and node with the projection component is further away (it is the parent's parent of the
 * projection's)
 *
 * So in general we have to go up as many parent components as there are projections nestings.
 *
 * - No projection nesting first parent component.
 * - One projection nesting, second parent component (parent's parent).
 * - Three projection nesting, third parent component (parent's parent's parent).
 * - And so on.
 *
 * @param vHost
 * @param rootVNode
 * @returns
 */
export const vnode_getProjectionParentComponent = (vHost: VNode): VirtualVNode | null => {
  let projectionDepth = 1;
  while (projectionDepth--) {
    while (
      vHost &&
      (vnode_isVirtualVNode(vHost) ? vHost.getProp(OnRenderProp, null) === null : true)
    ) {
      const qSlotParent = vHost.slotParent;
      const vProjectionParent = vnode_isVirtualVNode(vHost) && qSlotParent;
      if (vProjectionParent) {
        // We found a projection, so we need to go up one more level.
        projectionDepth++;
      }
      vHost = vProjectionParent || vHost.parent!;
    }
    if (projectionDepth > 0) {
      vHost = vHost.parent!;
    }
  }
  return vHost as VirtualVNode | null;
};
