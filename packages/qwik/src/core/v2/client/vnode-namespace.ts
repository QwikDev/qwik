import { HTML_NS, MATH_NS, SVG_NS } from '../../util/markers';
import {
  ElementVNodeProps,
  TextVNodeProps,
  VNodeFlags,
  VNodeProps,
  type ElementVNode,
  type VNode,
} from './types';
import {
  ensureElementVNode,
  vnode_getDOMChildNodes,
  vnode_getDomParentVNode,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getParent,
  vnode_isElementVNode,
  vnode_isTextVNode,
  type VNodeJournal,
} from './vnode';

export const isForeignObjectElement = (tag: string) => tag.toLowerCase() === 'foreignobject';

export const isSvgElement = (tag: string) => tag === 'svg' || isForeignObjectElement(tag);

export const isMathElement = (tag: string) => tag === 'math';

export const vnode_isDefaultNamespace = (vnode: ElementVNode): boolean => {
  const flags = vnode[VNodeProps.flags];
  return (flags & VNodeFlags.NAMESPACE_MASK) === 0;
};

export const vnode_getElementNamespaceFlags = (tag: string) => {
  if (isSvgElement(tag)) {
    return VNodeFlags.NS_svg;
  } else if (isMathElement(tag)) {
    return VNodeFlags.NS_math;
  } else {
    return VNodeFlags.NS_html;
  }
};

export function vnode_getDomChildrenWithCorrectNamespacesToInsert(
  journal: VNodeJournal,
  domParentVNode: ElementVNode,
  newChild: VNode
) {
  const { elementNamespace, elementNamespaceFlag } = getNewElementNamespaceData(
    domParentVNode,
    newChild
  );

  let domChildren: (Element | Text)[] = [];
  if (elementNamespace === HTML_NS) {
    // parent is in the default namespace, so just get the dom children. This is the fast path.
    domChildren = vnode_getDOMChildNodes(journal, newChild);
  } else {
    // parent is in a different namespace, so we need to clone the children with the correct namespace.
    // The namespace cannot be changed on nodes, so we need to clone these nodes
    const children = vnode_getDOMChildNodes(journal, newChild, true);

    for (let i = 0; i < children.length; i++) {
      const childVNode = children[i];
      if (vnode_isTextVNode(childVNode)) {
        // text nodes are always in the default namespace
        domChildren.push(childVNode[TextVNodeProps.node] as Text);
        continue;
      }
      if (
        (childVNode[VNodeProps.flags] & VNodeFlags.NAMESPACE_MASK) ===
        (domParentVNode[VNodeProps.flags] & VNodeFlags.NAMESPACE_MASK)
      ) {
        // if the child and parent have the same namespace, we don't need to clone the element
        domChildren.push(childVNode[ElementVNodeProps.element] as Element);
        continue;
      }

      // clone the element with the correct namespace
      const newChildElement = vnode_cloneElementWithNamespace(
        childVNode,
        domParentVNode,
        elementNamespace,
        elementNamespaceFlag
      );

      if (newChildElement) {
        domChildren.push(newChildElement);
      }
    }
  }
  return domChildren;
}

/** This function clones an element with a different namespace, but without the children. */
function cloneElementWithNamespace(
  element: Element,
  elementName: string,
  namespace: string
): Element {
  const newElement = element.ownerDocument.createElementNS(namespace, elementName);
  const attributes = element.attributes;
  for (const attribute of attributes) {
    const name = attribute.name;
    const value = attribute.value;
    if (!name || name === ':') {
      continue;
    }
    newElement.setAttribute(name, value);
  }
  return newElement;
}

/**
 * This function clones an ElementVNode with a different namespace, including the children. This
 * traverse the tree using depth-first search and clones the elements using
 * `cloneElementWithNamespace`.
 */
function vnode_cloneElementWithNamespace(
  elementVNode: ElementVNode,
  parentVNode: ElementVNode,
  namespace: string,
  namespaceFlag: VNodeFlags
) {
  ensureElementVNode(elementVNode);
  let vCursor: VNode | null = elementVNode;
  let vParent: VNode | null = null;
  let rootElement: Element | null = null;
  let parentElement: Element | null = null;
  while (vCursor) {
    if (vnode_isElementVNode(vCursor)) {
      // Clone the element
      const childElement = vCursor[ElementVNodeProps.element] as Element;
      const childElementTag = vnode_getElementName(vCursor);

      // We need to check if the parent is a foreignObject element
      // and get a new namespace data.
      const vCursorParent = vnode_getParent(vCursor);
      // For the first vNode parentNode is not parent from vNode tree, but parent from DOM tree
      // this is because vNode is not moved yet.
      // rootElement is null only for the first vNode
      const vCursorDomParent =
        rootElement == null ? parentVNode : vCursorParent && vnode_getDomParentVNode(vCursorParent);
      if (vCursorDomParent) {
        const namespaceData = getNewElementNamespaceData(
          vCursorDomParent,
          vnode_getElementName(vCursor)
        );
        namespace = namespaceData.elementNamespace;
        namespaceFlag = namespaceData.elementNamespaceFlag;
      }

      const newChildElement = cloneElementWithNamespace(childElement, childElementTag, namespace);

      childElement.remove();

      if (rootElement == null) {
        rootElement = newChildElement;
      }
      if (parentElement) {
        parentElement.appendChild(newChildElement);
      }
      parentElement = newChildElement;

      // Descend into children
      // We need first get the first child, if any
      const vFirstChild = vnode_getFirstChild(vCursor);
      // Then we can overwrite the cursor with newly created element.
      // This is because we need to materialize the children before we assign new element
      vCursor[ElementVNodeProps.element] = newChildElement;
      // Set correct namespace flag
      vCursor[VNodeProps.flags] &= VNodeFlags.NEGATED_NAMESPACE_MASK;
      vCursor[VNodeProps.flags] |= namespaceFlag;
      if (vFirstChild) {
        vCursor = vFirstChild;
        continue;
      }
    }
    if (vCursor === elementVNode) {
      // we are where we started, this means that vNode has no children, so we are done.
      return rootElement;
    }
    // Out of children, go to next sibling
    const vNextSibling = vnode_getNextSibling(vCursor);
    if (vNextSibling) {
      vCursor = vNextSibling;
      continue;
    }
    if (vCursor === elementVNode) {
      // we are back where we started, we are done.
      return rootElement;
    }
    // Out of siblings, go to parent
    vParent = vnode_getParent(vCursor);
    while (vParent) {
      if (vParent === elementVNode) {
        // We are back where we started, we are done.
        return rootElement;
      }
      const vNextParentSibling = vnode_getNextSibling(vParent);
      if (vNextParentSibling) {
        vCursor = vNextParentSibling;
        return rootElement;
      }
      vParent = vnode_getParent(vParent);
    }
    if (vParent == null) {
      // We are done.
      return rootElement;
    }
  }
  return rootElement;
}

function isSvg(tagOrVNode: string | ElementVNode): boolean {
  return typeof tagOrVNode === 'string'
    ? isSvgElement(tagOrVNode)
    : (tagOrVNode[VNodeProps.flags] & VNodeFlags.NS_svg) !== 0;
}

function isMath(tagOrVNode: string | ElementVNode): boolean {
  return typeof tagOrVNode === 'string'
    ? isMathElement(tagOrVNode)
    : (tagOrVNode[VNodeProps.flags] & VNodeFlags.NS_math) !== 0;
}

export function getNewElementNamespaceData(
  domParentVNode: ElementVNode | null,
  tag: string
): NewElementNamespaceData;
export function getNewElementNamespaceData(
  domParentVNode: ElementVNode | null,
  vnode: VNode
): NewElementNamespaceData;

export function getNewElementNamespaceData(
  domParentVNode: ElementVNode | null,
  tagOrVNode: string | VNode
): NewElementNamespaceData {
  const parentIsDefaultNamespace = domParentVNode
    ? !!vnode_getElementName(domParentVNode) && vnode_isDefaultNamespace(domParentVNode)
    : true;
  const parentIsForeignObject = !parentIsDefaultNamespace
    ? isForeignObjectElement(vnode_getElementName(domParentVNode!))
    : false;

  let elementNamespace = HTML_NS;
  let elementNamespaceFlag = VNodeFlags.NS_html;

  const isElementVNodeOrString = typeof tagOrVNode === 'string' || vnode_isElementVNode(tagOrVNode);

  if (isElementVNodeOrString && isSvg(tagOrVNode)) {
    elementNamespace = SVG_NS;
    elementNamespaceFlag = VNodeFlags.NS_svg;
  } else if (isElementVNodeOrString && isMath(tagOrVNode)) {
    elementNamespace = MATH_NS;
    elementNamespaceFlag = VNodeFlags.NS_math;
  } else if (domParentVNode && !parentIsForeignObject && !parentIsDefaultNamespace) {
    const isParentSvg = (domParentVNode[VNodeProps.flags] & VNodeFlags.NS_svg) !== 0;
    const isParentMath = (domParentVNode[VNodeProps.flags] & VNodeFlags.NS_math) !== 0;

    elementNamespace = isParentSvg ? SVG_NS : isParentMath ? MATH_NS : HTML_NS;
    elementNamespaceFlag = domParentVNode[VNodeProps.flags] & VNodeFlags.NAMESPACE_MASK;
  }

  return {
    elementNamespace,
    elementNamespaceFlag,
  };
}

interface NewElementNamespaceData {
  elementNamespace: string;
  elementNamespaceFlag: number;
}
