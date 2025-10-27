import { isDev } from '@qwik.dev/core/build';
import {
  HTML_NS,
  MATH_NS,
  Q_PROPS_SEPARATOR,
  SVG_NS,
  XLINK_NS,
  XML_NS,
} from '../shared/utils/markers';
import { getDomContainerFromQContainerElement } from './dom-container';
import { VNodeFlags } from './types';
import {
  ensureElementVNode,
  fastNamespaceURI,
  shouldIgnoreChildren,
  vnode_getDOMChildNodes,
  vnode_getDomParentVNode,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_isElementVNode,
  vnode_isTextVNode,
  type VNodeJournal,
} from './vnode';
import type { ElementVNode, VNode } from './vnode-impl';

export const isForeignObjectElement = (elementName: string) => {
  return isDev ? elementName.toLowerCase() === 'foreignobject' : elementName === 'foreignObject';
};

export const isSvgElement = (elementName: string) =>
  elementName === 'svg' || isForeignObjectElement(elementName);

export const isMathElement = (elementName: string) => elementName === 'math';

export const vnode_isDefaultNamespace = (vnode: ElementVNode): boolean => {
  const flags = vnode.flags;
  return (flags & VNodeFlags.NAMESPACE_MASK) === 0;
};

export const vnode_getElementNamespaceFlags = (element: Element) => {
  const namespace = fastNamespaceURI(element);
  switch (namespace) {
    case SVG_NS:
      return VNodeFlags.NS_svg;
    case MATH_NS:
      return VNodeFlags.NS_math;
    default:
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
        domChildren.push(childVNode.textNode as Text);
        continue;
      }
      if (
        (childVNode.flags & VNodeFlags.NAMESPACE_MASK) ===
        (domParentVNode.flags & VNodeFlags.NAMESPACE_MASK)
      ) {
        // if the child and parent have the same namespace, we don't need to clone the element
        domChildren.push(childVNode.element as Element);
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

/** This function clones an element with a different namespace, including the children */
function cloneDomTreeWithNamespace(
  element: Element,
  elementName: string,
  namespace: string,
  deep = false
): Element {
  const newElement = element.ownerDocument.createElementNS(namespace, elementName);

  // Copy all attributes
  for (const attr of element.attributes) {
    if (attr.name !== Q_PROPS_SEPARATOR) {
      newElement.setAttribute(attr.name, attr.value);
    }
  }

  if (deep) {
    // Recursively clone all child nodes
    for (const child of element.childNodes) {
      const nodeType = child.nodeType;
      if (nodeType === 3 /* Node.TEXT_NODE */) {
        newElement.appendChild(child.cloneNode());
      } else if (nodeType === 1 /* Node.ELEMENT_NODE */) {
        newElement.appendChild(
          cloneDomTreeWithNamespace(child as Element, (child as Element).localName, namespace, deep)
        );
      }
    }
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
    let childElement: Element | null = null;
    let newChildElement: Element | null = null;
    if (vnode_isElementVNode(vCursor)) {
      // Clone the element
      childElement = vCursor.element as Element;
      const childElementTag = vnode_getElementName(vCursor);

      // We need to check if the parent is a foreignObject element
      // and get a new namespace data.
      const vCursorParent = vCursor.parent;
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
      const vFirstChild = vnode_getFirstChild(vCursor);

      newChildElement = cloneDomTreeWithNamespace(
        childElement,
        childElementTag,
        namespace,
        // deep if there is no vnode children, children are probably inserted via innerHTML
        !vFirstChild
      );

      childElement.remove();

      if (rootElement == null) {
        rootElement = newChildElement;
      }
      if (parentElement) {
        parentElement.appendChild(newChildElement);
      }

      // Descend into children
      // We need first get the first child, if any

      // Then we can overwrite the cursor with newly created element.
      // This is because we need to materialize the children before we assign new element
      vCursor.element = newChildElement;
      // Set correct namespace flag
      vCursor.flags &= VNodeFlags.NEGATED_NAMESPACE_MASK;
      vCursor.flags |= namespaceFlag;
      if (vFirstChild) {
        vCursor = vFirstChild;
        parentElement = newChildElement;
        continue;
      } else if (shouldIgnoreChildren(childElement)) {
        // If we should ignore children of the element this means that the element is a container
        // We need to get the first child of the container
        const container = getDomContainerFromQContainerElement(childElement);

        if (container) {
          const innerContainerFirstVNode = vnode_getFirstChild(container.rootVNode);
          if (innerContainerFirstVNode) {
            vCursor = innerContainerFirstVNode;
            parentElement = newChildElement;
            continue;
          }
        }
      }
    }
    if (vCursor === elementVNode) {
      // we are where we started, this means that vNode has no children, so we are done.
      return rootElement;
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
      if (vParent === elementVNode) {
        // We are back where we started, we are done.
        return rootElement;
      }
      const vNextParentSibling = vParent.nextSibling as VNode | null;
      if (vNextParentSibling) {
        vCursor = vNextParentSibling;
        return rootElement;
      }
      vParent = vParent.parent;
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
    : (tagOrVNode.flags & VNodeFlags.NS_svg) !== 0;
}

function isMath(tagOrVNode: string | ElementVNode): boolean {
  return typeof tagOrVNode === 'string'
    ? isMathElement(tagOrVNode)
    : (tagOrVNode.flags & VNodeFlags.NS_math) !== 0;
}

export function getNewElementNamespaceData(
  domParentVNode: ElementVNode | null,
  elementName: string
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
    const isParentSvg = (domParentVNode.flags & VNodeFlags.NS_svg) !== 0;
    const isParentMath = (domParentVNode.flags & VNodeFlags.NS_math) !== 0;

    elementNamespace = isParentSvg ? SVG_NS : isParentMath ? MATH_NS : HTML_NS;
    elementNamespaceFlag = domParentVNode.flags & VNodeFlags.NAMESPACE_MASK;
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

export function getAttributeNamespace(attributeName: string): string | null {
  switch (attributeName) {
    case 'xlink:href':
    case 'xlink:actuate':
    case 'xlink:arcrole':
    case 'xlink:role':
    case 'xlink:show':
    case 'xlink:title':
    case 'xlink:type':
      return XLINK_NS;
    case 'xml:base':
    case 'xml:lang':
    case 'xml:space':
      return XML_NS;
    default:
      return null;
  }
}
