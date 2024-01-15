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
} from './types';
import { QwikElementAdapter } from './velement';
import {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  OnRenderProp,
  QScopedStyle,
  QSlotRef,
} from '../../util/markers';

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_newElement = (
  parentNode: VNode | null,
  element: Element,
  tag: string
): ElementVNode => {
  const vnode: ElementVNode = QwikElementAdapter.createElement(
    VNodeFlags.Element, // Flag
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
  const vnode: ElementVNode = QwikElementAdapter.createElement(
    VNodeFlags.Element, // Flag
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
  const vnode: TextVNode = QwikElementAdapter.createText(
    VNodeFlags.Text, // Flag
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
  const vnode: TextVNode = QwikElementAdapter.createText(
    VNodeFlags.Text || VNodeFlags.Inflated, // Flags
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
  const vnode: VirtualVNode = QwikElementAdapter.createVirtual(
    VNodeFlags.Virtual, // Flags
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
  if (Array.isArray(vNode) && vNode.length > 0) {
    const flag = (vNode as VNode)[VNodeProps.flags];
    return typeof flag === 'number' && (flag & VNodeFlags.TYPE_MASK) !== 0;
  }
  return false;
};

export const vnode_isElementVNode = (vNode: VNode): vNode is ElementVNode => {
  assertDefined(vNode, 'Missing vNode');
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & VNodeFlags.Element) === VNodeFlags.Element;
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
  return flag === VNodeFlags.Virtual;
};

const ensureTextVNode = (vNode: VNode): TextVNode => {
  assertTrue(vnode_isTextVNode(vNode), 'Expecting TextVNode was: ' + vnode_getNodeTypeName(vNode));
  return vNode as TextVNode;
};

const ensureElementOrVirtualVNode = (vNode: VNode): ElementVNode | VirtualVNode => {
  assertDefined(vNode, 'Missing vNode');
  assertTrue(
    (vNode[VNodeProps.flags] & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0,
    'Expecting ElementVNode or VirtualVNode was: ' + vnode_getNodeTypeName(vNode)
  );
  return vNode as ElementVNode | VirtualVNode;
};

const ensureVirtualVNode = (vNode: VNode): VirtualVNode => {
  assertTrue(
    vnode_isVirtualVNode(vNode),
    'Expecting VirtualVNode was: ' + vnode_getNodeTypeName(vNode)
  );
  return vNode as VirtualVNode;
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
  if (flags === VNodeFlags.Element) {
    const elementVNode = ensureElementVNode(vnode);
    elementVNode[VNodeProps.flags] ^= VNodeFlags.Inflated;
    const element = elementVNode[ElementVNodeProps.element];
    const attributes = element.attributes;
    for (let idx = 0; idx < attributes.length; idx++) {
      const attr = attributes[idx];
      const key = attr.name;
      const value = attr.value;
      mapArray_set(elementVNode as string[], key, value, ElementVNodeProps.PROPS_OFFSET);
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
    // Start at rootVNode and fallow the `elementPath` to find the vnode.
    for (let i = elementPath.length - 2; i >= 0; i--) {
      vNode = vnode_getVNodeForChildNode(vNode, elementPath[i]);
    }
    elementOffset != -1 && qVNodeRefs.set(elementOffset, vNode);
  }
  if (typeof id === 'string') {
    // process virtual node search.
    const idLength = id.length;
    let idx = indexOfAlphanumeric(id, idLength);
    let nthChildIdx = 0;
    while (idx < idLength) {
      const ch = id.charCodeAt(idx);
      nthChildIdx *= 26 /* a-z */;
      if (ch >= 97 /* a */) {
        // is lowercase
        nthChildIdx += ch - 97 /* a */;
      } else {
        // is uppercase
        nthChildIdx += ch - 65 /* A */;
        vNode = vnode_getNthChild(vNode, nthChildIdx);
        nthChildIdx = 0;
      }
      idx++;
    }
  }
  return vNode;
};

const vnode_getNthChild = (vNode: VNode, nthChildIdx: number): VNode => {
  let child = vnode_getFirstChild(vNode);
  assertDefined(child, 'Missing child.');
  while (nthChildIdx--) {
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

const mapApp_findIndx = (elementVNode: (string | null)[], key: string, start: number): number => {
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

export const mapArray_set = (
  elementVNode: (string | null)[],
  key: string,
  value: string | null,
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
    elementVNode.splice(indx ^ -1, 0, key, value);
  }
};

export const mapArray_get = (
  elementVNode: (string | null)[],
  key: string,
  start: number
): string | null => {
  const indx = mapApp_findIndx(elementVNode, key, start);
  if (indx >= 0) {
    return elementVNode[indx + 1] as string | null;
  } else {
    return null;
  }
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_insertBefore = (
  parent: ElementVNode | VirtualVNode,
  insertBefore: VNode | null,
  newChild: VNode
) => {
  ensureElementOrVirtualVNode(parent);
  const parentNode = vnode_getClosestParentNode(parent)!;
  assertDefined(parentNode, 'Missing parentNode.');
  if (vnode_isElementVNode(parent)) {
    ensureMaterialized(parent);
  }
  if (!vnode_isVirtualVNode(newChild)) {
    const shouldWeUseParentVirtual = insertBefore == null && vnode_isVirtualVNode(parent);
    const insertBeforeNode = vnode_getDOMInsertBefore(
      shouldWeUseParentVirtual ? parent : insertBefore
    );
    parentNode.insertBefore(vnode_getNode(newChild)!, insertBeforeNode);
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

export const vnode_remove = (vParent: VNode, vToRemove: VNode) => {
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
  if (!vnode_isVirtualVNode(vParent)) {
    vnode_getDOMParent(vParent)!.removeChild(vnode_getNode(vToRemove)!);
  }
};

export const vnode_truncate = (vParent: ElementVNode | VirtualVNode, vDelete: VNode) => {
  ensureElementVNode(vParent);
  assertDefined(vDelete, 'Missing vDelete.');
  const parent = vnode_getNode(vParent)!;
  let child: Node | null = vnode_getNode(vDelete)!;
  while (child !== null) {
    const nextSibling = child.nextSibling as Node | null;
    parent.removeChild(child);
    child = nextSibling;
  }
  const vPrevious = vDelete[VNodeProps.previousSibling];
  if (vPrevious) {
    vPrevious[VNodeProps.nextSibling] = null;
  } else {
    vParent[ElementVNodeProps.firstChild] = null;
  }
  vParent[ElementVNodeProps.lastChild] = vPrevious;
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

export const vnode_getPropKeys = (vnode: ElementVNode | VirtualVNode): string[] => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
    vnode_ensureElementInflated(vnode);
    const keys: string[] = [];
    for (
      let i = vnode_isElementVNode(vnode)
        ? ElementVNodeProps.PROPS_OFFSET
        : VirtualVNodeProps.PROPS_OFFSET;
      i < vnode.length;
      i = i + 2
    ) {
      keys.push(vnode[i] as string);
    }
    return keys;
  }
  return [];
};

export const vnode_setProp = (vnode: VNode, key: string, value: string | null): void => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
    vnode_ensureElementInflated(vnode);
    const idx = mapApp_findIndx(
      vnode as string[],
      key,
      vnode_isElementVNode(vnode) ? ElementVNodeProps.PROPS_OFFSET : VirtualVNodeProps.PROPS_OFFSET
    );
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

export const vnode_getProp = (vnode: VNode, key: string): string | null => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
    vnode_ensureElementInflated(vnode);
    return mapArray_get(
      vnode as string[],
      key,
      vnode_isElementVNode(vnode) ? ElementVNodeProps.PROPS_OFFSET : VirtualVNodeProps.PROPS_OFFSET
    );
  }
  return null;
};

export const vnode_getResolvedProp = (
  vnode: VirtualVNode,
  key: string,
  getObject: (id: number) => any
) => {
  ensureVirtualVNode(vnode);
  const idx = mapApp_findIndx(vnode as any, key, VirtualVNodeProps.PROPS_OFFSET);
  if (idx >= 0) {
    let value = vnode[idx + 1] as any;
    if (typeof value === 'string') {
      vnode[idx + 1] = value = getObject(parseInt(value));
    }
    return value;
  }
  return null;
};

export const vnode_setResolvedProp = (vnode: VirtualVNode, key: string, value: any) => {
  ensureVirtualVNode(vnode);
  const idx = mapApp_findIndx(vnode as any, key, VirtualVNodeProps.PROPS_OFFSET);
  if (idx >= 0) {
    vnode[idx + 1] = value;
  } else if (value != null) {
    vnode.splice(idx ^ -1, 0, key, value);
  }
};

export const vnode_propsToRecord = (vnode: VNode): Record<string, any> => {
  const props: Record<string, any> = {};
  if (!vnode_isTextVNode(vnode)) {
    for (
      let i = vnode_isElementVNode(vnode)
        ? ElementVNodeProps.PROPS_OFFSET
        : VirtualVNodeProps.PROPS_OFFSET;
      i < vnode.length;

    ) {
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
  depth: number = 4,
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
      strings.push(JSON.stringify(vnode_getText(vnode)));
    } else if (vnode_isVirtualVNode(vnode)) {
      const attrs: string[] = [];
      vnode_getPropKeys(vnode).forEach((key) => {
        const value = vnode_getProp(vnode!, key);
        attrs.push(' ' + key + '=' + JSON.stringify(value));
      });
      const name = vnode_getProp(vnode, OnRenderProp) != null ? 'Component' : 'Fragment';
      strings.push('<' + name + attrs.join('') + '>');
      const child = vnode_getFirstChild(vnode);
      child && strings.push('  ' + vnode_toString.call(child, depth - 1, offset + '  ', true));
      strings.push('</' + name + '>');
    } else if (vnode_isElementVNode(vnode)) {
      const tag = vnode_getElementName(vnode);
      const attrs: string[] = [];
      vnode_getPropKeys(vnode).forEach((key) => {
        const value = vnode_getProp(vnode!, key);
        attrs.push(' ' + key + '=' + JSON.stringify(value));
      });
      const node = vnode_getNode(vnode) as HTMLElement;
      if (node) {
        const vnodeData = (node.ownerDocument as QDocument).qVNodeData.get(node);
        if (vnodeData) {
          attrs.push(' q:vnodeData=' + JSON.stringify(vnodeData));
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
      peek() <= 58 /* `:` */ ||
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
      vnode_setProp(vParent, QScopedStyle, consumeValue());
    } else if (peek() === 60 /* `<` */) {
      vnode_setProp(vParent, OnRenderProp, consumeValue());
    } else if (peek() === 61 /* `=` */) {
      vnode_setProp(vParent, ELEMENT_ID, consumeValue());
    } else if (peek() === 62 /* `>` */) {
      vnode_setProp(vParent, ELEMENT_PROPS, consumeValue());
    } else if (peek() === 63 /* `?` */) {
      vnode_setProp(vParent, QSlotRef, consumeValue());
    } else if (peek() === 64 /* `@` */) {
      vnode_setProp(vParent, ELEMENT_KEY, consumeValue());
    } else if (peek() === 91 /* `[` */) {
      vnode_setProp(vParent, ELEMENT_SEQ, consumeValue());
    } else if (peek() === 123 /* `{` */) {
      consume();
      addVNode(vnode_newVirtual(vParent));
      stack.push(vParent, vFirst, vLast, child, previousTextNode);
      vParent = vLast as ElementVNode | VirtualVNode;
      vFirst = vLast = null;
    } else if (peek() === 125 /* `}` */) {
      consume();
      vParent[ElementVNodeProps.lastChild] = vLast;
      previousTextNode = stack.pop();
      child = stack.pop();
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
