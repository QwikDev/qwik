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

import { assertDefined, assertEqual, assertFalse, assertTrue } from '../../error/assert';
import { throwErrorAndStop } from '../../util/log';
import {
  VNodeFlags as VNodeFlags,
  VNodeProps,
  type ContainerElement,
  type ElementVNode,
  type VirtualVNode,
  type QDocument,
  type TextVNode,
  type VNode,
  ElementVNodeProps,
  TextVNodeProps,
  VirtualVNodeProps,
  VNodeFlagsIndex,
} from './types';
import {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  OnRenderProp,
  QCtxAttr,
  QScopedStyle,
  QSlotParent,
  QSlotRef,
} from '../../util/markers';
import { isQrl } from '../../qrl/qrl-class';
import { isDev } from '@builder.io/qwik/build';

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_newElement = (
  parentNode: VNode | null,
  element: Element,
  tag: string
): ElementVNode => {
  const vnode: ElementVNode = VNodeArray.createElement(
    VNodeFlags.Element | (-1 << VNodeFlagsIndex.shift), // Flag
    parentNode as VNode | null,
    null,
    null,
    null,
    null,
    element,
    tag
  );
  assertTrue(vnode_isElementVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isVirtualVNode(vnode), 'Incorrect format of ElementVNode.');
  return vnode as unknown as ElementVNode;
};

export const vnode_newUnMaterializedElement = (
  parentNode: VNode | null,
  element: Element
): ElementVNode => {
  const vnode: ElementVNode = VNodeArray.createElement(
    VNodeFlags.Element | (-1 << VNodeFlagsIndex.shift), // Flag
    parentNode as VNode | null,
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
  return vnode as unknown as ElementVNode;
};

export const vnode_newSharedText = (
  parentNode: VNode,
  previousTextNode: TextVNode | null,
  sharedTextNode: Text | null,
  textContent: string
): TextVNode => {
  const vnode: TextVNode = VNodeArray.createText(
    VNodeFlags.Text | (-1 << VNodeFlagsIndex.shift), // Flag
    parentNode, // Parent
    previousTextNode, // Previous TextNode (usually first child)
    null, // Next sibling
    sharedTextNode, // SharedTextNode
    textContent // Text Content
  );
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isVirtualVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as TextVNode;
};

export const vnode_newText = (
  parentNode: VNode,
  textNode: Text,
  textContent: string | undefined
): TextVNode => {
  const vnode: TextVNode = VNodeArray.createText(
    VNodeFlags.Text | VNodeFlags.Inflated | (-1 << VNodeFlagsIndex.shift), // Flags
    parentNode, // Parent
    null, // No previous sibling
    null, // We may have a next sibling.
    textNode, // TextNode
    textContent // Text Content
  );
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isVirtualVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as TextVNode;
};

export const vnode_newVirtual = (parentNode: VNode): VirtualVNode => {
  const vnode: VirtualVNode = VNodeArray.createVirtual(
    VNodeFlags.Virtual | (-1 << VNodeFlagsIndex.shift), // Flags
    parentNode,
    null,
    null,
    null,
    null
  );
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isVirtualVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as VirtualVNode;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_isVNode = (vNode: any): vNode is VNode => {
  return vNode instanceof VNodeArray;
  // if (Array.isArray(vNode) && vNode.length > 0) {
  //   const flag = (vNode as VNode)[VNodeProps.flags];
  //   return typeof flag === 'number' && (flag & VNodeFlags.TYPE_MASK) !== 0;
  // }
  // return false;
};

export const vnode_isElementVNode = (vNode: VNode): vNode is ElementVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & VNodeFlags.Element) === VNodeFlags.Element;
};

export const vnode_isElementOrVirtualVNode = (
  vNode: VNode
): vNode is ElementVNode | VirtualVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0;
};

export const vnode_isMaterialized = (vNode: VNode): boolean => {
  assertDefined(vNode, 'Missing vNode');
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (
    (flag & VNodeFlags.Element) === VNodeFlags.Element &&
    vNode[ElementVNodeProps.firstChild] !== undefined &&
    vNode[ElementVNodeProps.lastChild] !== undefined
  );
};

export const vnode_isTextVNode = (vNode: VNode): vNode is TextVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & VNodeFlags.Text) === VNodeFlags.Text;
};

export const vnode_isVirtualVNode = (vNode: VNode): vNode is VirtualVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & VNodeFlags.Virtual) === VNodeFlags.Virtual;
};

const ensureTextVNode = (vNode: VNode): TextVNode => {
  assertTrue(vnode_isTextVNode(vNode), 'Expecting TextVNode was: ' + vnode_getNodeTypeName(vNode));
  return vNode as TextVNode;
};

const ensureElementOrVirtualVNode = (vNode: VNode) => {
  assertDefined(vNode, 'Missing vNode');
  assertTrue(
    (vNode[VNodeProps.flags] & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0,
    'Expecting ElementVNode or VirtualVNode was: ' + vnode_getNodeTypeName(vNode)
  );
};

const ensureElementVNode = (vNode: VNode): ElementVNode => {
  assertTrue(
    vnode_isElementVNode(vNode),
    'Expecting ElementVNode was: ' + vnode_getNodeTypeName(vNode)
  );
  return vNode as ElementVNode;
};

export const vnode_getNodeTypeName = (vNode: VNode): string => {
  if (vNode) {
    const flags = vNode[VNodeProps.flags];
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

export const vnode_ensureElementInflated = (vnode: VNode) => {
  const flags = vnode[VNodeProps.flags];
  if ((flags & VNodeFlags.TYPE_MASK) === VNodeFlags.Element) {
    const elementVNode = ensureElementVNode(vnode);
    elementVNode[VNodeProps.flags] ^= VNodeFlags.Inflated;
    const element = elementVNode[ElementVNodeProps.element];
    const attributes = element.attributes;
    for (let idx = 0; idx < attributes.length; idx++) {
      const attr = attributes[idx];
      const key = attr.name;
      const value = attr.value;
      mapArray_set(elementVNode as string[], key, value, vnode_getPropStartIndex(vnode));
    }
  }
};

const vnode_getDOMParent = (vnode: VNode): Element | null => {
  while (vnode && !vnode_isElementVNode(vnode)) {
    vnode = vnode[VNodeProps.parent]!;
  }
  return vnode && vnode[ElementVNodeProps.element];
};

const vnode_getDOMInsertBefore = (vNode: VNode | null): Node | null => {
  while (vNode) {
    const type = vNode[VNodeProps.flags];
    if (type & VNodeFlags.ELEMENT_OR_TEXT_MASK) {
      return vnode_getNode(vNode);
    } else {
      assertTrue(vnode_isVirtualVNode(vNode), 'Expecting Fragment');
      let vNext = vnode_getFirstChild(vNode) || vnode_getNextSibling(vNode);
      while (vNext === null) {
        vNode = vnode_getParent(vNode)!;
        if (vNode == null || vnode_isElementVNode(vNode)) {
          // we traversed all nodes and did not find anything;
          return null;
        }
        vNext = vnode_getNextSibling(vNode);
      }
      vNode = vNext;
    }
  }
  return null;
};

export const vnode_getDOMChildNodes = (root: VNode, childNodes: Node[] = []): Node[] => {
  if (vnode_isElementVNode(root)) {
    return [vnode_getNode(root)!];
  }
  let vNode = vnode_getFirstChild(root);
  while (vNode) {
    if (vnode_isElementVNode(vNode)) {
      childNodes.push(vnode_getNode(vNode)!);
    } else if (vnode_isTextVNode(vNode)) {
      childNodes.push(vnode_getNode(vNode)!);
    } else {
      vnode_getDOMChildNodes(vNode, childNodes);
    }
    vNode = vnode_getNextSibling(vNode);
  }
  return childNodes;
};

const vnode_ensureTextInflated = (vnode: TextVNode) => {
  const textVNode = ensureTextVNode(vnode);
  const flags = textVNode[VNodeProps.flags];
  if (flags === VNodeFlags.Text) {
    // Find the first TextVNode
    let firstTextVnode = vnode;
    while (true as boolean) {
      const previous = firstTextVnode[VNodeProps.previousSibling];
      if (previous && vnode_isTextVNode(previous)) {
        firstTextVnode = previous;
      } else {
        break;
      }
    }
    // Find the last TextVNode
    let lastTextVnode = vnode;
    while (true as boolean) {
      const next = lastTextVnode[VNodeProps.nextSibling];
      if (next && vnode_isTextVNode(next)) {
        lastTextVnode = next;
      } else {
        break;
      }
    }
    // iterate over each text node and inflate it.
    const parentNode = vnode_getDOMParent(vnode)!;
    assertDefined(parentNode, 'Missing parentNode.');
    const doc = parentNode.ownerDocument;
    // Process the last node first and use the existing dom Node as the last node.
    let textNode = lastTextVnode[TextVNodeProps.node] as Text | null;
    const textValue = lastTextVnode[TextVNodeProps.text] as string;
    if (textNode === null) {
      const insertBeforeNode = vnode_getDOMInsertBefore(vnode_getNextSibling(lastTextVnode));
      textNode = lastTextVnode[TextVNodeProps.node] = doc.createTextNode(textValue);
      parentNode.insertBefore(textNode, insertBeforeNode);
    } else {
      textNode.nodeValue = textValue;
    }
    lastTextVnode[VNodeProps.flags] = VNodeFlags.Text | VNodeFlags.Inflated;
    while (firstTextVnode !== lastTextVnode) {
      const previousTextNode = (firstTextVnode[TextVNodeProps.node] = doc.createTextNode(
        firstTextVnode[TextVNodeProps.text] as string
      ));
      parentNode.insertBefore(previousTextNode, textNode);
      firstTextVnode = firstTextVnode[VNodeProps.nextSibling] as TextVNode;
      assertDefined(firstTextVnode, 'Missing firstTextVnode.');
      firstTextVnode[VNodeProps.flags] = VNodeFlags.Text | VNodeFlags.Inflated;
    }
  }
};

export const vnode_locate = (rootVNode: ElementVNode, id: string | Element): VNode => {
  ensureElementVNode(rootVNode);
  let vNode: VNode | Element = rootVNode;
  const containerElement = rootVNode[ElementVNodeProps.element] as ContainerElement;
  const { qVNodeRefs } = containerElement;
  let elementOffset: number = -1;
  let refElement: Element | VNode;
  if (typeof id === 'string') {
    assertDefined(qVNodeRefs, 'Missing qVNodeRefs.');
    elementOffset = parseInt(id);
    refElement = qVNodeRefs.get(elementOffset)!;
  } else {
    refElement = id;
  }
  assertDefined(refElement, 'Missing refElement.');
  if (!Array.isArray(refElement)) {
    assertTrue(
      containerElement.contains(refElement),
      'refElement must be a child of containerElement.'
    );
    // We need to find the vnode.
    let parent = refElement;
    const elementPath: Element[] = [refElement];
    while (parent && parent !== containerElement) {
      parent = parent.parentElement!;
      elementPath.push(parent);
    }
    // Start at rootVNode and follow the `elementPath` to find the vnode.
    for (let i = elementPath.length - 2; i >= 0; i--) {
      vNode = vnode_getVNodeForChildNode(vNode, elementPath[i]);
    }
    elementOffset != -1 && qVNodeRefs.set(elementOffset, vNode);
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
  while (child[VNodeProps.flags] >>> VNodeFlagsIndex.shift !== childIdx) {
    child = vnode_getNextSibling(child);
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
  // console.log(
  //   'SEARCHING',
  //   child[VNodeProps.flags],
  //   child[VNodeProps.node]?.outerHTML,
  //   childNode.outerHTML
  // );
  while (child && child[ElementVNodeProps.element] !== childElement) {
    // console.log('CHILD', child[VNodeProps.node]?.outerHTML, childNode.outerHTML);
    if (vnode_isVirtualVNode(child)) {
      const next = vnode_getNextSibling(child);
      next && vNodeStack.push(next);
      child = vnode_getFirstChild(child);
    } else {
      const next = vnode_getNextSibling(child);
      if (next) {
        child = next;
      } else {
        child = next || vNodeStack.pop()!;
      }
    }
    assertDefined(child, 'Missing child.');
  }
  ensureElementVNode(child);
  assertEqual(child[ElementVNodeProps.element], childElement, 'Child not found.');
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

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const mapApp_findIndx = <T>(
  elementVNode: (T | null)[],
  key: string,
  start: number
): number => {
  assertTrue(start % 2 === 0, 'Expecting even number.');
  let bottom = (start as number) >> 1;
  let top = (elementVNode.length - 2) >> 1;
  while (bottom <= top) {
    const mid = bottom + ((top - bottom) >> 1);
    const midKey = elementVNode[mid << 1] as string;
    if (midKey === key) {
      return mid << 1;
    }
    if (midKey < key) {
      bottom = mid + 1;
    } else {
      top = mid - 1;
    }
  }
  return (bottom << 1) ^ -1;
};

export const mapArray_set = <T>(
  elementVNode: (T | null)[],
  key: string,
  value: T | null,
  start: number
) => {
  const indx = mapApp_findIndx(elementVNode, key, start);
  if (indx >= 0) {
    if (value == null) {
      elementVNode.splice(indx, 2);
    } else {
      elementVNode[indx + 1] = value;
    }
  } else if (value != null) {
    elementVNode.splice(indx ^ -1, 0, key as any, value);
  }
};

export const mapApp_remove = <T>(
  elementVNode: (T | null)[],
  key: string,
  start: number
): T | null => {
  const indx = mapApp_findIndx(elementVNode, key, start);
  let value: T | null = null;
  if (indx >= 0) {
    value = elementVNode[indx + 1];
    elementVNode.splice(indx, 2);
    return value;
  }
  return value;
};

export const mapArray_get = <T>(
  elementVNode: (T | null)[],
  key: string,
  start: number
): T | null => {
  const indx = mapApp_findIndx(elementVNode, key, start);
  if (indx >= 0) {
    return elementVNode[indx + 1] as T | null;
  } else {
    return null;
  }
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_insertBefore = (
  parent: ElementVNode | VirtualVNode,
  newChild: VNode,
  insertBefore: VNode | null
) => {
  ensureElementOrVirtualVNode(parent);
  const parentNode = vnode_getClosestParentNode(parent)!;
  assertFalse(newChild === insertBefore, "Can't insert before itself");
  if (vnode_isElementVNode(parent)) {
    ensureMaterialized(parent);
  }
  if (!vnode_isVirtualVNode(newChild)) {
    const shouldWeUseParentVirtual = insertBefore == null && vnode_isVirtualVNode(parent);
    const insertBeforeNode = vnode_getDOMInsertBefore(
      shouldWeUseParentVirtual ? parent : insertBefore
    );
    parentNode && parentNode.insertBefore(vnode_getNode(newChild)!, insertBeforeNode);
  }

  // link newChild into the previous/next list
  const vNext = insertBefore;
  const vPrevious = vNext
    ? vNext[VNodeProps.previousSibling]
    : (parent[ElementVNodeProps.lastChild] as VNode | null);
  if (vNext) {
    vNext[VNodeProps.previousSibling] = newChild;
  } else {
    parent[ElementVNodeProps.lastChild] = newChild;
  }
  if (vPrevious) {
    vPrevious[VNodeProps.nextSibling] = newChild;
  } else {
    parent[ElementVNodeProps.firstChild] = newChild;
  }
  newChild[VNodeProps.previousSibling] = vPrevious;
  newChild[VNodeProps.nextSibling] = vNext;
};

export const vnode_getClosestParentNode = (vnode: VNode): Node | null => {
  while (vnode && !vnode_isElementVNode(vnode)) {
    vnode = vnode[VNodeProps.parent]!;
  }
  return vnode && vnode[ElementVNodeProps.element];
};

export const vnode_remove = (vParent: VNode, vToRemove: VNode, removeDOM: boolean) => {
  const vPrevious = vToRemove[VNodeProps.previousSibling];
  const vNext = vToRemove[VNodeProps.nextSibling];
  if (vPrevious) {
    vPrevious[VNodeProps.nextSibling] = vNext;
  } else {
    vParent[ElementVNodeProps.firstChild] = vNext;
  }
  if (vNext) {
    vNext[VNodeProps.previousSibling] = vPrevious;
  } else {
    vParent[ElementVNodeProps.lastChild] = vPrevious;
  }
  if (removeDOM && !vnode_isVirtualVNode(vParent)) {
    vnode_getDOMParent(vParent)!.removeChild(vnode_getNode(vToRemove)!);
  }
};

export const vnode_truncate = (vParent: ElementVNode | VirtualVNode, vDelete: VNode) => {
  assertDefined(vDelete, 'Missing vDelete.');
  const parent = vnode_getDOMParent(vParent)!;
  const children = vnode_getDOMChildNodes(vDelete)!;
  for (let idx = 0; idx < children.length; idx++) {
    const child = children[idx];
    parent.removeChild(child);
  }
  const vPrevious = vDelete[VNodeProps.previousSibling];
  if (vPrevious) {
    vPrevious[VNodeProps.nextSibling] = null;
  } else {
    vParent[ElementVNodeProps.firstChild] = null;
  }
  vParent[ElementVNodeProps.lastChild] = vPrevious;
};

export const vnode_isChildOf = (vParent: VNode, vChild: VNode): boolean => {
  let vNode = vChild;
  while (vNode) {
    if (vNode === vParent) {
      return true;
    }
    vNode = vnode_getParent(vNode)!;
  }
  return false;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_getElementName = (vnode: ElementVNode): string => {
  const elementVNode = ensureElementVNode(vnode);
  let elementName = elementVNode[ElementVNodeProps.elementName];
  if (elementName === undefined) {
    elementName = elementVNode[ElementVNodeProps.elementName] =
      elementVNode[ElementVNodeProps.element].nodeName.toLowerCase();
  }
  return elementName;
};

export const vnode_getText = (vnode: TextVNode): string => {
  const textVNode = ensureTextVNode(vnode);
  let text = textVNode[TextVNodeProps.text];
  if (text === undefined) {
    text = textVNode[TextVNodeProps.text] = textVNode[TextVNodeProps.node]!.nodeValue!;
  }
  return text;
};

export const vnode_setText = (textVNode: TextVNode, text: string) => {
  vnode_ensureTextInflated(textVNode);
  const textNode = textVNode[TextVNodeProps.node]!;
  textNode.nodeValue = textVNode[TextVNodeProps.text] = text;
};

export const vnode_getFirstChild = (vnode: VNode): VNode | null => {
  if (vnode_isTextVNode(vnode)) {
    return null;
  }
  let vFirstChild = vnode[ElementVNodeProps.firstChild];
  if (vFirstChild === undefined) {
    vFirstChild = ensureMaterialized(vnode as ElementVNode);
  }
  return vFirstChild;
};

const ensureMaterialized = (vnode: ElementVNode): VNode | null => {
  const vParent = ensureElementVNode(vnode);
  let vFirstChild = vParent[ElementVNodeProps.firstChild];
  if (vFirstChild === undefined) {
    // need to materialize the vNode.
    const element = vParent[ElementVNodeProps.element];
    const firstChild = element.firstChild;
    const vNodeData = (element.ownerDocument as QDocument)?.qVNodeData?.get(element);
    vFirstChild = vNodeData
      ? materializeFromVNodeData(vParent, vNodeData, firstChild)
      : materializeFromDOM(vParent, firstChild);
  }
  assertTrue(vParent[ElementVNodeProps.firstChild] !== undefined, 'Did not materialize.');
  assertTrue(vParent[ElementVNodeProps.lastChild] !== undefined, 'Did not materialize.');
  return vFirstChild;
};

const materializeFromDOM = (vParent: ElementVNode, firstChild: ChildNode | null) => {
  let vFirstChild: VNode | null = null;
  // materialize from DOM
  let child = firstChild;
  let vChild: VNode | null = null;
  while (child) {
    const nodeType = child.nodeType;
    let vNextChild: VNode | null = null;
    if (nodeType === /* Node.TEXT_NODE */ 3) {
      vNextChild = vnode_newText(vParent, child as Text, undefined);
    } else if (nodeType === /* Node.ELEMENT_NODE */ 1) {
      vNextChild = vnode_newUnMaterializedElement(vParent, child as Element);
    }
    if (vNextChild) {
      vChild && (vChild[VNodeProps.nextSibling] = vNextChild);
      vNextChild[VNodeProps.previousSibling] = vChild;
      vChild = vNextChild;
    }
    if (!vFirstChild) {
      vParent[ElementVNodeProps.firstChild] = vFirstChild = vChild;
    }
    child = child.nextSibling;
  }
  vParent[ElementVNodeProps.lastChild] = vChild || null;
  vParent[ElementVNodeProps.firstChild] = vFirstChild;
  return vFirstChild;
};

export const vnode_getNextSibling = (vnode: VNode): VNode | null => {
  return vnode[VNodeProps.nextSibling];
};

export const vnode_getPreviousSibling = (vnode: VNode): VNode | null => {
  return vnode[VNodeProps.previousSibling];
};

export const vnode_getAttrKeys = (vnode: ElementVNode | VirtualVNode): string[] => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
    vnode_ensureElementInflated(vnode);
    const keys: string[] = [];
    for (let i = vnode_getPropStartIndex(vnode); i < vnode.length; i = i + 2) {
      keys.push(vnode[i] as string);
    }
    return keys;
  }
  return [];
};

export const vnode_setAttr = (vnode: VNode, key: string, value: string | null): void => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
    vnode_ensureElementInflated(vnode);
    const idx = mapApp_findIndx(vnode as string[], key, vnode_getPropStartIndex(vnode));
    if (idx >= 0) {
      if (vnode[idx + 1] != value && (type & VNodeFlags.Element) !== 0) {
        // Values are different, update DOM
        const element = vnode[ElementVNodeProps.element] as Element;
        if (value == null) {
          element.removeAttribute(key);
        } else {
          element.setAttribute(key, value!);
        }
      }
      if (value == null) {
        vnode.splice(idx, 2);
      } else {
        vnode[idx + 1] = value;
      }
    } else if (value != null) {
      vnode.splice(idx ^ -1, 0, key, value);
      if ((type & VNodeFlags.Element) !== 0) {
        // New value, update DOM
        const element = vnode[ElementVNodeProps.element] as Element;
        element.setAttribute(key, value);
      }
    }
  }
};

export const vnode_getAttr = (vnode: VNode, key: string): string | null => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
    vnode_ensureElementInflated(vnode);
    return mapArray_get(vnode as string[], key, vnode_getPropStartIndex(vnode));
  }
  return null;
};

export const vnode_getProp = <T>(
  vnode: VNode,
  key: string,
  getObject: ((id: string) => any) | null
): T | null => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
    const idx = mapApp_findIndx(vnode as any, key, VirtualVNodeProps.PROPS_OFFSET);
    if (idx >= 0) {
      let value = vnode[idx + 1] as any;
      if (typeof value === 'string' && getObject) {
        vnode[idx + 1] = value = getObject(value);
      }
      return value;
    }
  }
  return null;
};

// export const vnode_clearLocalProps = (vnode: VNode) => {
//   const type = vnode[VNodeProps.flags];
//   if ((type & VNodeFlags.Virtual) !== 0) {
//     for (let idx = VirtualVNodeProps.PROPS_OFFSET; idx < vnode.length; idx += 2) {
//       const key = vnode[idx] as string;
//       if (key.startsWith(':')) {
//         vnode[idx + 1] = null;
//       }
//     }
//   }
// };

export const vnode_setProp = (vnode: VirtualVNode | ElementVNode, key: string, value: unknown) => {
  ensureElementOrVirtualVNode(vnode);
  const idx = mapApp_findIndx(vnode as any, key, vnode_getPropStartIndex(vnode));
  if (idx >= 0) {
    vnode[idx + 1] = value as any;
  } else if (value != null) {
    vnode.splice(idx ^ -1, 0, key, value as any);
  }
};

export const vnode_getPropStartIndex = (vnode: VNode): number => {
  const type = vnode[VNodeProps.flags] & VNodeFlags.TYPE_MASK;
  if (type === VNodeFlags.Element) {
    return ElementVNodeProps.PROPS_OFFSET;
  } else if (type === VNodeFlags.Virtual) {
    return VirtualVNodeProps.PROPS_OFFSET;
  } else {
    return -1;
  }
};

export const vnode_propsToRecord = (vnode: VNode): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  if (!vnode_isTextVNode(vnode)) {
    for (let i = vnode_getPropStartIndex(vnode); i < vnode.length; ) {
      const key = vnode[i++] as string;
      const value = vnode[i++];
      props[key] = value;
    }
  }
  return props;
};

export const vnode_getParent = (vnode: VNode): VNode | null => {
  return vnode[VNodeProps.parent] || null;
};

export const vnode_getNode = (vnode: VNode) => {
  assertDefined(vnode, 'Missing vnode.');
  if (vnode_isVirtualVNode(vnode)) {
    return null;
  }
  if (vnode_isElementVNode(vnode)) {
    return vnode[ElementVNodeProps.element];
  }
  assertTrue(vnode_isTextVNode(vnode), 'Expecting Text Node.');
  return vnode[TextVNodeProps.node]!;
};

export function vnode_toString(
  this: VNode | null,
  depth: number = 10,
  offset: string = '',
  materialize: boolean = false
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
  do {
    if (vnode_isTextVNode(vnode)) {
      strings.push(stringify(vnode_getText(vnode)));
    } else if (vnode_isVirtualVNode(vnode)) {
      const attrs: string[] = [];
      vnode_getAttrKeys(vnode).forEach((key) => {
        const value = vnode_getAttr(vnode!, key);
        attrs.push(' ' + key + '=' + stringify(value));
      });
      const name = vnode_getAttr(vnode, OnRenderProp) != null ? 'Component' : 'Fragment';
      strings.push('<' + name + attrs.join('') + '>');
      const child = vnode_getFirstChild(vnode);
      child && strings.push('  ' + vnode_toString.call(child, depth - 1, offset + '  ', true));
      strings.push('</' + name + '>');
    } else if (vnode_isElementVNode(vnode)) {
      const tag = vnode_getElementName(vnode);
      const attrs: string[] = [];
      vnode_getAttrKeys(vnode).forEach((key) => {
        const value = vnode_getAttr(vnode!, key);
        attrs.push(' ' + key + '=' + stringify(value));
      });
      const node = vnode_getNode(vnode) as HTMLElement;
      if (node) {
        const vnodeData = (node.ownerDocument as QDocument).qVNodeData?.get(node);
        if (vnodeData) {
          attrs.push(' q:vnodeData=' + stringify(vnodeData));
        }
      }
      strings.push('<' + tag + attrs.join('') + '>');
      if (vnode_isMaterialized(vnode) || materialize) {
        const child = vnode_getFirstChild(vnode);
        child && strings.push('  ' + vnode_toString.call(child, depth - 1, offset + '  ', true));
      } else {
        strings.push('  <!-- not materialized --!>');
      }
      strings.push('</' + tag + '>');
    }
    vnode = vnode_getNextSibling(vnode) || null;
  } while (vnode);
  return strings.join('\n' + offset);
}

const isNumber = (ch: number) => /* `0` */ 48 <= ch && ch <= 57; /* `9` */
const isLowercase = (ch: number) => /* `a` */ 97 <= ch && ch <= 122; /* `z` */

const stack: any[] = [];
function materializeFromVNodeData(
  vParent: ElementVNode | VirtualVNode,
  vData: string,
  child: Node | null
): VNode {
  let idx = 0;
  let nextToConsumeIdx = 0;
  let vFirst: VNode | null = null;
  let vLast: VNode | null = null;
  let previousTextNode: TextVNode | null = null;
  let ch = 0;
  let peekCh = 0;
  const peek = () => {
    if (peekCh !== 0) {
      return peekCh;
    } else {
      return (peekCh = nextToConsumeIdx < vData!.length ? vData!.charCodeAt(nextToConsumeIdx) : 0);
    }
  };
  const consume = () => {
    ch = peek();
    peekCh = 0;
    nextToConsumeIdx++;
    return ch;
  };
  const addVNode = (node: VNode) => {
    node[VNodeProps.flags] =
      (node[VNodeProps.flags] & VNodeFlagsIndex.negated_mask) | (idx << VNodeFlagsIndex.shift);
    idx++;
    vLast && (vLast[VNodeProps.nextSibling] = node);
    node[VNodeProps.previousSibling] = vLast;
    if (!vFirst) {
      vParent[ElementVNodeProps.firstChild] = vFirst = node;
    }
    vLast = node;
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

  let textIdx = 0;
  let combinedText: string | null = null;
  // console.log(
  //   'processVNodeData',
  //   vNodeData,
  //   (child?.parentNode as HTMLElement | undefined)?.outerHTML
  // );
  while (peek() !== 0) {
    if (isNumber(peek())) {
      // Element counts get encoded as numbers.
      while (!isElement(child)) {
        child = child!.nextSibling;
        if (!child) {
          throwErrorAndStop(
            'Materialize error: missing element: ' + vData + ' ' + peek() + ' ' + nextToConsumeIdx
          );
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
        addVNode(vnode_newUnMaterializedElement(vParent, child as Element));
        child = child!.nextSibling;
      }
      // collect the elements;
    } else if (peek() === 59 /* `;` */) {
      vnode_setAttr(vParent, QScopedStyle, consumeValue());
    } else if (peek() === 60 /* `<` */) {
      vnode_setAttr(vParent, OnRenderProp, consumeValue());
    } else if (peek() === 61 /* `=` */) {
      vnode_setAttr(vParent, ELEMENT_ID, consumeValue());
    } else if (peek() === 62 /* `>` */) {
      vnode_setAttr(vParent, ELEMENT_PROPS, consumeValue());
    } else if (peek() === 63 /* `?` */) {
      vnode_setAttr(vParent, QSlotRef, consumeValue());
    } else if (peek() === 64 /* `@` */) {
      vnode_setAttr(vParent, ELEMENT_KEY, consumeValue());
    } else if (peek() === 91 /* `[` */) {
      vnode_setAttr(vParent, ELEMENT_SEQ, consumeValue());
    } else if (peek() === 93 /* `]` */) {
      vnode_setAttr(vParent, QCtxAttr, consumeValue());
    } else if (peek() === 124 /* `|` */) {
      const key = consumeValue();
      const value = consumeValue();
      vnode_setAttr(vParent as VirtualVNode, key, value);
    } else if (peek() === 123 /* `{` */) {
      consume();
      addVNode(vnode_newVirtual(vParent));
      stack.push(vParent, vFirst, vLast, previousTextNode, idx);
      idx = 0;
      vParent = vLast as ElementVNode | VirtualVNode;
      vFirst = vLast = null;
    } else if (peek() === 125 /* `}` */) {
      consume();
      vParent[ElementVNodeProps.lastChild] = vLast;
      idx = stack.pop();
      previousTextNode = stack.pop();
      vLast = stack.pop();
      vFirst = stack.pop();
      vParent = stack.pop();
    } else {
      // must be alphanumeric
      let length = 0;
      if (combinedText === null) {
        combinedText = child ? child.nodeValue : null;
        textIdx = 0;
      }
      while (isLowercase(peek())) {
        length += consume() - 97; /* `a` */
        length *= 26;
      }
      length += consume() - 65; /* `A` */
      const text = combinedText === null ? '' : combinedText.substring(textIdx, textIdx + length);
      addVNode(
        (previousTextNode = vnode_newSharedText(
          vParent,
          previousTextNode,
          combinedText === null ? null : (child as Text),
          text
        ))
      );
      textIdx += length;
      // Text nodes get encoded as alphanumeric characters.
    }
  }
  vParent[ElementVNodeProps.lastChild] = vLast;
  return vFirst!;
}

export const vnode_getType = (vnode: VNode): 1 | 3 | 11 => {
  const type = vnode[VNodeProps.flags];
  if (type & VNodeFlags.Element) {
    return 1 /* Element */;
  } else if (type & VNodeFlags.Virtual) {
    return 11 /* Virtual */;
  } else if (type & VNodeFlags.Text) {
    return 3 /* Text */;
  }
  throw throwErrorAndStop('Unknown vnode type: ' + type);
};

const isElement = (node: any): node is Element =>
  node && typeof node == 'object' && node.nodeType === /** Node.ELEMENT_NODE* */ 1;

export const vnode_documentPosition = (a: VNode, b: VNode): -1 | 0 | 1 => {
  let aNode: Node | null = null;
  if (a === b) {
    return 0;
  }
  /**
   * - We keep b as constant
   * - We move a in a depth first way until we get to an element. Than we just compare elements.
   */
  while (!aNode && a) {
    if (a === b) {
      // 'a' started before b. (we walked `a` and reached `b`)
      return -1;
    }
    const type = a[VNodeProps.flags];
    if (type & VNodeFlags.ELEMENT_OR_TEXT_MASK) {
      aNode = vnode_getNode(a) as Element;
    } else {
      assertTrue(vnode_isVirtualVNode(a), 'Expecting Virtual');
      let vNext = vnode_getFirstChild(a) || vnode_getNextSibling(a);
      while (vNext === null) {
        a = vnode_getParent(a)!;
        if (vnode_isElementVNode(a)) {
          // we traversed all nodes and did not find anything;
          aNode = vnode_getNode(a)!;
          break;
        } else {
          vNext = vnode_getNextSibling(a);
        }
      }
      a = vNext!;
    }
  }
  const bNode = vnode_getDOMParent(b)!;

  if (aNode === bNode) {
    // This means that `b` must have been before `a`
    return 1;
  }
  const DOCUMENT_POSITION_PRECEDING = 2; /// Node.DOCUMENT_POSITION_PRECEDING
  return (aNode!.compareDocumentPosition(bNode) & DOCUMENT_POSITION_PRECEDING) !== 0 ? 1 : -1;
};

/**
 * Use this method to find the parent component for projection.
 *
 * Normally the parent component is just the first component which we encounter while traversing the
 * parents.
 *
 * However, if during traversal we encounter a projection, than we have to follow the projection,
 * and nod weth the projection component is further away (it is the parent's parent of the
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
 * @param getObjectById
 * @returns
 */
export const vnode_getProjectionParentComponent = (
  vHost: VNode,
  getObjectById: (id: string) => unknown
) => {
  let projectionDepth = 1;
  while (projectionDepth--) {
    while (
      vHost && vnode_isVirtualVNode(vHost)
        ? vnode_getProp(vHost, OnRenderProp, null) === null
        : true
    ) {
      const vProjectionParent =
        vnode_isVirtualVNode(vHost) &&
        (vnode_getProp(vHost, QSlotParent, getObjectById) as VNode | null);
      if (vProjectionParent) {
        // We found a projection, so we need to go up one more level.
        projectionDepth++;
      }
      vHost = vProjectionParent || vnode_getParent(vHost)!;
    }
    if (projectionDepth > 0) {
      vHost = vnode_getParent(vHost)!;
    }
  }
  return vHost;
};

const stringifyPath: any[] = [];
const stringify = (value: any): any => {
  stringifyPath.push(value);
  try {
    if (value === null) {
      return 'null';
    } else if (value === undefined) {
      return 'undefined';
    } else if (typeof value === 'string') {
      return '"' + value + '"';
    } else if (typeof value === 'function') {
      if (isQrl(value)) {
        return '"' + (value.$chunk$ || '') + '#' + value.$hash$ + '"';
      } else {
        return '"' + value.name + '()"';
      }
    } else if (vnode_isVNode(value)) {
      if (stringifyPath.indexOf(value) !== -1) {
        return '*';
      } else {
        return '"' + String(value).replaceAll(/\n\s*/gm, '') + '"';
      }
    } else if (Array.isArray(value)) {
      return '[' + value.map(stringify).join(', ') + ']';
    } else {
      return String(value);
    }
  } finally {
    stringifyPath.pop();
  }
};

const VNodeArray = class VNode extends Array {
  static createElement(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null,
    nextSibling: VNode | null,
    firstChild: VNode | null | undefined,
    lastChild: VNode | null | undefined,
    element: Element,
    tag: string | undefined
  ) {
    const vnode = new VNode(flags, parent, previousSibling, nextSibling) as any;
    vnode.push(firstChild, lastChild, element, tag);
    return vnode;
  }

  static createText(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null,
    nextSibling: VNode | null,
    textNode: Text | null,
    text: string | undefined
  ) {
    const vnode = new VNode(flags, parent, previousSibling, nextSibling) as any;
    vnode.push(textNode, text);
    return vnode;
  }

  static createVirtual(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null,
    nextSibling: VNode | null,
    firstChild: VNode | null,
    lastChild: VNode | null
  ) {
    const vnode = new VNode(flags, parent, previousSibling, nextSibling) as any;
    vnode.push(firstChild, lastChild);
    return vnode;
  }

  constructor(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined
  ) {
    super();
    this.push(flags, parent, previousSibling, nextSibling);
    if (isDev) {
      this.toString = vnode_toString;
    }
  }
};
