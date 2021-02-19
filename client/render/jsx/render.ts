/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {
  isDomElementWithTagName,
  isTextNode,
  NodeType,
  removeNode,
  replaceNode,
} from '../util/dom.js';

import { applyAttributes } from './attributes.js';
import { isJSXNode, JSXNode } from './factory.js';
import { JSXRegistry } from './registry.js';

/**
 * Render JSX into a host element reusing DOM nodes when possible.
 *
 * @param host Host element which will act as a parent to `jsxNode`. When
 *     possible the rendering will try to reuse existing nodes.
 * @param jsxNode JSX to render
 * @param registry JSXRegistry used for creating rendering boundaries.
 * @param overrideDocument optional document used for creating new DOM nodes
 *     (used global `document` otherwise)
 */
export function jsxRender(
  host: Element | Document,
  jsxNode: JSXNode,
  registry?: JSXRegistry | null,
  overrideDocument?: Document
) {
  let firstChild = host.firstChild;
  while (firstChild && firstChild.nodeType > NodeType.COMMENT_NODE) {
    firstChild = firstChild.nextSibling;
  }
  reconcileNode(
    overrideDocument || document,
    registry || null,
    host,
    firstChild,
    jsxNode
  );
}

/**
 * Reconciles the existing DOM node with SJX nodes.
 *
 * @param document Used for creating new nodes
 * @param registry `JSXRegistry`
 * @param domParent Existing DOM parent into which new nodes will be inserted.
 * @param existingNode Optional existing node which needs to be reconciled, or
 *     deleted
 * @param jsxNode JSX node which is the source of truth.
 * @returns a new DOM node at this location (this may be `domNode` if it can be
 *     reused)
 */
function reconcileNode(
  document: Document,
  registry: JSXRegistry | null,
  domParent: Node,
  existingNode: Node | null,
  jsxNode: JSXNode
): Node | null {
  let reconciledNode: Node | null = null;
  if (typeof jsxNode.tag === 'string') {
    reconciledNode = reconcileElement(
      document,
      registry,
      domParent,
      existingNode,
      jsxNode
    );
  }
  reconcileChildren(
    document,
    registry,
    reconciledNode || domParent,
    reconciledNode?.firstChild || null,
    jsxNode.children
  );
  return reconciledNode;
}

function reconcileElement(
  document: Document,
  registry: JSXRegistry | null,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode
): Element {
  const jsxTag = jsxNode.tag as string;
  let reconcileElement: Element;
  if (isDomElementWithTagName(existingNode, jsxTag)) {
    // We already have the right element so we need to reuse it.
    reconcileElement = existingNode;
  } else {
    // No match we need to create a new DOM element (and remove the old one)
    reconcileElement = replaceNode(
      parentNode,
      existingNode,
      document.createElement(jsxTag)
    );
  }
  applyAttributes(reconcileElement, jsxNode.props);
  const component = registry && registry[jsxTag];
  if (component) {
    reconcileNode(
      document,
      registry,
      reconcileElement,
      reconcileElement.firstChild,
      component(jsxNode.props)
    );
  } else {
    reconcileChildren(
      document,
      registry,
      reconcileElement,
      reconcileElement.firstChild,
      jsxNode.children
    );
  }
  return reconcileElement;
}

function reconcileChildren(
  document: Document,
  registry: JSXRegistry | null,
  parentNode: Node,
  existingNode: Node | null,
  jsxChildren: any[]
): Element | null {
  if (jsxChildren) {
    for (let i = 0; i < jsxChildren.length; i++) {
      const jsxChild = jsxChildren[i];
      if (isJSXNode(jsxChild)) {
        // Element
        existingNode = reconcileElement(
          document,
          registry,
          parentNode,
          existingNode,
          jsxChild
        );
      } else if (jsxChild == null) {
        // delete
        if (existingNode) {
          existingNode = removeNode(parentNode, existingNode);
        }
      } else {
        // stringify
        if (isTextNode(existingNode)) {
          existingNode.textContent = String(jsxChild);
        } else {
          replaceNode(
            parentNode,
            existingNode,
            document.createTextNode(String(jsxChild))
          );
        }
      }
      existingNode = existingNode?.nextSibling || null;
    }
  }

  while (existingNode) {
    existingNode = removeNode(parentNode, existingNode);
  }
  return null;
}
