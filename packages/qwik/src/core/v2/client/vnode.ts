import { assertDefined, assertFalse, assertTrue } from '../../error/assert';
import { throwErrorAndStop } from '../../util/log';
import {
  Flags as VNodeFlags,
  VNodeProps,
  type ContainerElement,
  type ElementVNode,
  type FragmentVNode,
  type QDocument,
  type TextVNode,
  type VNode,
} from './types';
import { QwikElementAdapter } from './velement';
import { ELEMENT_ID, ELEMENT_KEY, QScopedStyle, QSlotRef } from '../../util/markers';

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_newInflatedElement = (
  parentNode: VNode | null,
  element: Element,
  tag: string
): ElementVNode => {
  const vnode: ElementVNode = QwikElementAdapter.create(
    VNodeFlags.Element, // Flag
    parentNode as VNode | null,
    null,
    null,
    null,
    element,
    tag,
    null
  );
  assertTrue(vnode_isElementVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isFragmentVNode(vnode), 'Incorrect format of ElementVNode.');
  return vnode as unknown as ElementVNode;
};

export const vnode_newDeflatedElement = (
  parentNode: VNode | null,
  element: Element
): ElementVNode => {
  const vnode: ElementVNode = QwikElementAdapter.create(
    VNodeFlags.Element | VNodeFlags.NeedsInflation, // Flag
    parentNode as VNode | null,
    undefined,
    undefined,
    undefined,
    element,
    undefined,
    null
  );
  assertTrue(vnode_isElementVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isFragmentVNode(vnode), 'Incorrect format of ElementVNode.');
  return vnode as unknown as ElementVNode;
};

export const vnode_newDeflatedText = (
  parentNode: VNode,
  previousTextNode: TextVNode | null,
  sharedTextNode: Text | null,
  textContent: string
): TextVNode => {
  const vnode: TextVNode = QwikElementAdapter.create(
    VNodeFlags.Text | VNodeFlags.NeedsInflation, // Flag
    parentNode, // Parent
    null, // Previous sibling
    null, // Next sibling
    previousTextNode, // Previous TextNode (usually first child)
    sharedTextNode, // SharedTextNode
    textContent, // Text Content
    null
  );
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isFragmentVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as TextVNode;
};

export const vnode_newInflatedText = (
  parentNode: VNode,
  textNode: Text,
  textContent: string
): TextVNode => {
  const vnode: TextVNode = QwikElementAdapter.create(
    VNodeFlags.Text, // Flags
    parentNode, // Parent
    undefined, // No previous sibling
    undefined, // We may have a next sibling.
    null, // No previous TextNode because we ere inflated
    textNode, // TextNode
    textContent, // Text Content
    null
  );
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isFragmentVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as TextVNode;
};

export const vnode_newFragment = (parentNode: VNode): FragmentVNode => {
  const vnode: FragmentVNode = QwikElementAdapter.create(
    VNodeFlags.Fragment, // Flags
    parentNode,
    null,
    null,
    null,
    null,
    undefined,
    null
  );
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isFragmentVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as FragmentVNode;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_isElementVNode = (vNode: VNode | null | undefined): vNode is ElementVNode => {
  if (!vNode) {
    return false;
  }
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & VNodeFlags.Element) === VNodeFlags.Element;
};

export const vnode_isTextVNode = (vNode: VNode | null | undefined): vNode is TextVNode => {
  if (!vNode) {
    return false;
  }
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & VNodeFlags.Text) === VNodeFlags.Text;
};

export const vnode_isFragmentVNode = (vNode: VNode | null | undefined): vNode is FragmentVNode => {
  if (!vNode) {
    return false;
  }
  const flag = (vNode as VNode)[VNodeProps.flags];
  return flag === VNodeFlags.Fragment;
};

const ensureTextVNode = (vNode: VNode | null): TextVNode => {
  assertTrue(vnode_isTextVNode(vNode), 'Expecting TextVNode was: ' + vnode_getNodeTypeName(vNode));
  return vNode as TextVNode;
};

const ensureFragmentVNode = (vNode: VNode | null): FragmentVNode => {
  assertTrue(
    vnode_isElementVNode(vNode),
    'Expecting FragmentVNode was: ' + vnode_getNodeTypeName(vNode)
  );
  return vNode as FragmentVNode;
};

const ensureElementVNode = (vNode: VNode | null): ElementVNode => {
  assertTrue(
    vnode_isElementVNode(vNode),
    'Expecting ElementVNode was: ' + vnode_getNodeTypeName(vNode)
  );
  return vNode as ElementVNode;
};

export const vnode_getNodeTypeName = (vNode: VNode | null): string => {
  if (vNode) {
    const flags = vNode[VNodeProps.flags];
    const prefix =
      (flags & VNodeFlags.NeedsInflation) === VNodeFlags.NeedsInflation ? 'Deflated' : '';
    switch (flags & VNodeFlags.MaskType) {
      case VNodeFlags.Element:
        return prefix + 'Element';
      case VNodeFlags.Fragment:
        return prefix + 'Fragment';
      case VNodeFlags.Text:
        return prefix + 'Text';
    }
  }
  return '<unknown>';
};

const ensureInflatedElementVNode = (vnode: VNode | null) => {
  const elementVNode = ensureElementVNode(vnode);
  const flags = elementVNode[VNodeProps.flags];
  if (flags === VNodeFlags.Element) {
    elementVNode[VNodeProps.flags] = VNodeFlags.Element;
    const element = elementVNode[VNodeProps.node];
    const attributes = element.attributes;
    for (let idx = 0; idx < attributes.length; idx++) {
      const attr = attributes[idx];
      const key = attr.name;
      const value = attr.value;
      mapArray_set(elementVNode as string[], key, value, VNodeProps.propsStart);
    }
  }
  return elementVNode;
};

const vnode_getDOMParent = (vnode: VNode): Element | null => {
  while (vnode && !vnode_isElementVNode(vnode)) {
    vnode = vnode[VNodeProps.parent];
  }
  return vnode && vnode[VNodeProps.node];
};

const vnode_getDOMInsertBefore = (vnode: VNode | null): Node | null => {
  while (vnode && !vnode_isElementVNode(vnode)) {
    vnode = vnode[VNodeProps.nextSibling] as VNode | null;
  }
  return vnode && vnode[VNodeProps.node];
};

const ensureInflatedTextVNode = (vnode: VNode): TextVNode => {
  const textVNode = ensureTextVNode(vnode);
  const flags = textVNode[VNodeProps.flags];
  if ((flags & VNodeFlags.NeedsInflation) === VNodeFlags.NeedsInflation) {
    // Find the first TextVNode
    let firstTextVnode = vnode;
    while (true as boolean) {
      const previous = firstTextVnode[VNodeProps.firstChildOrPreviousText];
      if (vnode_isTextVNode(previous)) {
        firstTextVnode = previous;
      } else {
        break;
      }
    }
    // Find the last TextVNode
    let lastTextVnode = vnode;
    while (true as boolean) {
      const next = lastTextVnode[VNodeProps.nextSibling];
      if (vnode_isTextVNode(next)) {
        lastTextVnode = next;
      } else {
        break;
      }
    }
    // iterate over each text node and inflate it.
    const parentNode = vnode_getDOMParent(vnode)!;
    assertDefined(parentNode, 'Missing parentNode.');
    const qDocument = parentNode.ownerDocument as QDocument;
    let existingTextNode = lastTextVnode[VNodeProps.node] as Text | null;
    const lastText = lastTextVnode[VNodeProps.tagOrContent] as string;
    if (existingTextNode === null) {
      const insertBeforeNode = vnode_getDOMInsertBefore(vnode_getNextSibling(lastTextVnode));
      existingTextNode = lastTextVnode[VNodeProps.node] = qDocument.createTextNode(lastText);
      parentNode.insertBefore(existingTextNode, insertBeforeNode);
    } else {
      existingTextNode.nodeValue = lastText;
    }
    while (firstTextVnode !== lastTextVnode) {
      const textNode = (firstTextVnode[VNodeProps.node] = qDocument.createTextNode(
        firstTextVnode[VNodeProps.tagOrContent] as string
      ));
      parentNode.insertBefore(textNode, existingTextNode);
      firstTextVnode = firstTextVnode[VNodeProps.nextSibling] as TextVNode;
      firstTextVnode[VNodeProps.flags] = VNodeFlags.Text;
    }
    lastTextVnode[VNodeProps.flags] = VNodeFlags.Text;
    textVNode[VNodeProps.flags] = VNodeFlags.Text;
  }
  return textVNode;
};

export const vnode_locate = (rootVNode: ElementVNode, id: string | Element): VNode => {
  ensureElementVNode(rootVNode);
  let vNode: VNode | Element = rootVNode;
  const containerElement = rootVNode[VNodeProps.node] as ContainerElement;
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
  childNode: Element
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
  while (child[VNodeProps.node] !== childNode) {
    // console.log('CHILD', child[VNodeProps.node]?.outerHTML, childNode.outerHTML);
    if (vnode_isFragmentVNode(child)) {
      vNodeStack.push(child);
      child = vnode_getFirstChild(child);
    } else {
      child = vnode_getNextSibling(child);
      if (child === null && vNodeStack.length !== 0) {
        child = vNodeStack.pop()!;
        child = vnode_getNextSibling(child);
      }
    }
    assertDefined(child, 'Missing child.');
  }
  ensureElementVNode(child);
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

export const vnode_insertChildAfter = (
  vParent: ElementVNode | FragmentVNode,
  vInsertAfterNode: VNode | null,
  newChild: VNode
) => {
  ensureElementVNode(vParent);
  const parent = vnode_getNode(vParent);
  const child = vnode_getNode(newChild);
  const vNext = vInsertAfterNode
    ? vnode_getNextSibling(vInsertAfterNode)
    : vnode_getFirstChild(vParent);
  const insertBefore = vNext ? vnode_getNode(vNext) : null;
  parent.insertBefore(child, insertBefore);
  if (vInsertAfterNode === null) {
    vParent[VNodeProps.firstChildOrPreviousText] = newChild;
  } else {
    vInsertAfterNode[VNodeProps.nextSibling] = newChild;
  }
  newChild[VNodeProps.nextSibling] = vNext;
};

export const vnode_truncate = (vParent: ElementVNode | FragmentVNode, vPrevious: VNode | null) => {
  ensureElementVNode(vParent);
  const parent = vnode_getNode(vParent);
  const vChild = vPrevious ? vnode_getNextSibling(vPrevious) : vnode_getFirstChild(vParent);
  if (vChild) {
    let child: Node | null = vnode_getNode(vChild);
    let next = child.nextSibling;
    while (child !== null) {
      next = child.nextSibling;
      parent.removeChild(child);
      child = next;
    }
  }
  if (vPrevious == null) {
    vParent[VNodeProps.firstChildOrPreviousText] = null;
  } else {
    vPrevious[VNodeProps.nextSibling] = null;
  }
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_getElementName = (vnode: ElementVNode): string => {
  const elementVNode = ensureElementVNode(vnode);
  let value = elementVNode[VNodeProps.tagOrContent];
  if (value === undefined) {
    value = elementVNode[VNodeProps.tagOrContent] =
      elementVNode[VNodeProps.node].nodeName.toLowerCase();
  }
  return value;
};

export const vnode_getText = (vnode: TextVNode): string => {
  const textVNode = ensureTextVNode(vnode);
  let value = textVNode[VNodeProps.tagOrContent];
  if (value === undefined) {
    value = textVNode[VNodeProps.tagOrContent] = textVNode[VNodeProps.node]!.nodeValue!;
  }
  return value;
};

export const vnode_setText = (vnode: TextVNode, text: string) => {
  const textVNode = ensureInflatedTextVNode(vnode);
  const textNode = textVNode[VNodeProps.node]!;
  textNode.nodeValue = textVNode[VNodeProps.tagOrContent] = text;
};

export const vnode_getFirstChild = (vnode: VNode): VNode | null => {
  if (vnode_isTextVNode(vnode)) {
    return null;
  }
  let value = vnode[VNodeProps.firstChildOrPreviousText];
  if (value === undefined) {
    const elementNode = ensureElementVNode(vnode);
    const node = elementNode[VNodeProps.node];
    const firstChild = node.firstChild;
    const qDocument = node.ownerDocument as QDocument;
    const vNodeData = qDocument.qVNodeData;
    value = vnode_fromNode(elementNode, vNodeData.get(node), firstChild);
    vnode[VNodeProps.firstChildOrPreviousText] = value;
  }
  return value;
};

export const vnode_setFirstChild = (
  vnode: ElementVNode | FragmentVNode | TextVNode,
  firstChild: VNode | null
) => {
  vnode[VNodeProps.firstChildOrPreviousText] = firstChild as VNode | null;
};

export const vnode_getNextSibling = (vnode: VNode): VNode | null => {
  let value = vnode[VNodeProps.nextSibling];
  if (value === undefined) {
    assertTrue(!vnode_isFragmentVNode(vnode), 'Unexpected location of FragmentVNode.');
    const node = vnode[VNodeProps.node] as Node;
    const nextSibling = node.nextSibling;
    if (nextSibling) {
      const parentVNode = vnode[VNodeProps.parent];
      if (parentVNode) {
        value = vnode_fromNode(ensureElementVNode(parentVNode), undefined, nextSibling);
      }
    }
    value = value || null;
    vnode[VNodeProps.nextSibling] = value;
  }
  return value;
};

export const vnode_setNextSibling = (vnode: VNode, next: VNode | null) => {
  vnode[VNodeProps.nextSibling] = next;
};

export const vnode_getPropKeys = (vnode: VNode): string[] => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.MaskElementOrFragment) !== 0) {
    if ((type & VNodeFlags.NeedsInflation) === VNodeFlags.NeedsInflation) {
      ensureInflatedElementVNode(vnode);
    }
    const keys: string[] = [];
    for (let i = VNodeProps.propsStart; i < vnode.length; i = i + 2) {
      keys.push(vnode[i] as string);
    }
    return keys;
  }
  return [];
};

export const vnode_setProp = (vnode: VNode, key: string, value: string | null): void => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.MaskElementOrFragment) !== 0) {
    if ((type & VNodeFlags.NeedsInflation) === VNodeFlags.NeedsInflation) {
      ensureInflatedElementVNode(vnode);
    }
    const idx = mapApp_findIndx(vnode as string[], key, VNodeProps.propsStart);
    if (idx >= 0) {
      if (vnode[idx + 1] != value && (type & VNodeFlags.Element) !== 0) {
        // Values are different, update DOM
        const element = vnode[VNodeProps.node] as Element;
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
        const element = vnode[VNodeProps.node] as Element;
        element.setAttribute(key, value);
      }
    }
  }
};

export const vnode_getProp = (vnode: VNode, key: string): string | null => {
  const type = vnode[VNodeProps.flags];
  if ((type & VNodeFlags.MaskElementOrFragment) !== 0) {
    if ((type & VNodeFlags.NeedsInflation) === VNodeFlags.NeedsInflation) {
      ensureInflatedElementVNode(vnode);
    }
    return mapArray_get(vnode as string[], key, VNodeProps.propsStart);
  }
  return null;
};

export const vnode_propsToRecord = (vnode: VNode): Record<string, any> => {
  const props: Record<string, any> = {};
  if (!vnode_isTextVNode(vnode)) {
    for (let i = VNodeProps.propsStart; i < vnode.length; ) {
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

export const vnode_getNode = (vnode: VNode): Node => {
  return vnode[VNodeProps.node] as Node;
};

const vnode_fromNode = (
  parentVNode: ElementVNode,
  vNodeData: string | undefined,
  node: Node | null
): VNode | null => {
  // console.log('vNodeData:', vNodeData, vnode_toString(parentNode));
  if (vNodeData) {
    return processVNodeData(parentVNode, vNodeData, node);
  } else if (node != null) {
    if (node.nodeType === /* Node.TEXT_NODE */ 3) {
      return vnode_newInflatedText(parentVNode, node as Text, node.nodeValue!);
    } else {
      return vnode_newDeflatedElement(parentVNode, node as Element);
    }
  }
  return null;
};
export function vnode_toString(
  this: VNode | null,
  depth: number = 4,
  offset: string = '',
  includeSiblings: boolean = false
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
    } else if (vnode_isFragmentVNode(vnode)) {
      const attrs: string[] = [];
      vnode_getPropKeys(vnode).forEach((key) => {
        const value = vnode_getProp(vnode!, key);
        attrs.push(' ' + key + '=' + JSON.stringify(value));
      });
      strings.push('<Fragment' + attrs.join('') + '>');
      const child = vnode_getFirstChild(vnode);
      child && strings.push('  ' + vnode_toString.call(child, depth - 1, offset + '  ', true));
      strings.push('</Fragment>');
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
      const child = vnode_getFirstChild(vnode);
      child && strings.push('  ' + vnode_toString.call(child, depth - 1, offset + '  ', true));
      strings.push('</' + tag + '>');
    }
    vnode = (includeSiblings && vnode_getNextSibling(vnode)) || null;
  } while (vnode);
  return strings.join('\n' + offset);
}

const isNumber = (ch: number) => /* `0` */ 48 <= ch && ch <= 57; /* `9` */
const isLowercase = (ch: number) => /* `a` */ 97 <= ch && ch <= 122; /* `z` */

const stack: any[] = [];
function processVNodeData(parentVNode: VNode, vNodeData: string, child: Node | null): VNode {
  let nextToConsumeIdx = 0;
  let firstVNode: VNode | null = null;
  let lastVNode: VNode | null = null;
  let previousTextNode: TextVNode | null = null;
  let ch = 0;
  let peekCh = 0;
  const peek = () => {
    if (peekCh !== 0) {
      return peekCh;
    } else {
      return (peekCh =
        nextToConsumeIdx < vNodeData!.length ? vNodeData!.charCodeAt(nextToConsumeIdx) : 0);
    }
  };
  const consume = () => {
    ch = peek();
    peekCh = 0;
    nextToConsumeIdx++;
    return ch;
  };
  const addVNode = (node: VNode) => {
    firstVNode = firstVNode || node;
    lastVNode && vnode_setNextSibling(lastVNode, node);
    lastVNode = node;
  };

  const consumeValue = () => {
    consume();
    const start = nextToConsumeIdx;
    while (peek() <= 58 /* `:` */ || (peekCh >= 65 /* `A` */ && peekCh <= 122) /* `z` */) {
      consume();
    }
    return vNodeData.substring(start, nextToConsumeIdx);
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
            'Inflation error: missing element: ' + vNodeData + ' ' + peek() + ' ' + nextToConsumeIdx
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
        addVNode(vnode_newDeflatedElement(parentVNode, child as Element));
        child = child!.nextSibling;
      }
      // collect the elements;
    } else if (peek() === 59 /* `;` */) {
      vnode_setProp(parentVNode, QScopedStyle, consumeValue());
    } else if (peek() === 61 /* `=` */) {
      vnode_setProp(parentVNode, ELEMENT_ID, consumeValue());
    } else if (peek() === 63 /* `?` */) {
      vnode_setProp(parentVNode, QSlotRef, consumeValue());
    } else if (peek() === 64 /* `@` */) {
      vnode_setProp(parentVNode, ELEMENT_KEY, consumeValue());
    } else if (peek() === 123 /* `{` */) {
      consume();
      addVNode(vnode_newFragment(parentVNode));
      stack.push(parentVNode, firstVNode, lastVNode, child, previousTextNode);
      parentVNode = lastVNode!;
      firstVNode = lastVNode = null;
    } else if (peek() === 125 /* `}` */) {
      consume();
      const firstChild = firstVNode;
      lastVNode && vnode_setNextSibling(lastVNode, null);
      previousTextNode = stack.pop();
      child = stack.pop();
      lastVNode = stack.pop();
      firstVNode = stack.pop();
      parentVNode = stack.pop();
      vnode_setFirstChild(lastVNode!, firstChild);
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
        (previousTextNode = vnode_newDeflatedText(
          parentVNode,
          previousTextNode,
          combinedText === null ? null : (child as Text),
          text
        ))
      );
      textIdx += length;
      // Text nodes get encoded as alphanumeric characters.
    }
  }
  return firstVNode!;
}

export const vnode_getType = (vnode: VNode): 1 | 3 | 11 => {
  const type = vnode[VNodeProps.flags];
  if (type & VNodeFlags.Element) {
    return 1 /* Element */;
  } else if (type & VNodeFlags.Fragment) {
    return 11 /* Fragment */;
  } else if (type & VNodeFlags.Text) {
    return 3 /* Text */;
  }
  throw throwErrorAndStop('Unknown vnode type: ' + type);
};

const isElement = (node: any): node is Element =>
  node && typeof node == 'object' && node.nodeType === /** Node.ELEMENT_NODE* */ 1;
