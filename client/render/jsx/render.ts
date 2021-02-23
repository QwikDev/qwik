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
} from '../../util/dom.js';
import '../../util/qDev.js';
import { flattenPromiseTree, isPromise } from '../../util/promises.js';

import { applyAttributes } from './attributes.js';
import { isJSXNode, JSXNode, JSXFactory } from './factory.js';
import { JSXRegistry } from './registry.js';
import { qImport } from '../../import/index.js';
import { EMPTY_OBJ } from '../../util/flyweight.js';

/**
 * Rendering can happen asynchronously. For this reason rendering keeps track of all of the
 * asynchronous render elements. This promise is than flatten before being returned as `As
 */
type AsyncHostElementPromises = Array<Element | Promise<Element | AsyncHostElementPromises>>;

/**
 * After rendering completes the `jsxRender` asynchronously returns a list of host elements
 * rendered asynchronously.
 */
type HostElements = Element[];

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
export async function jsxRender(
  host: Element | Document,
  jsxNode: JSXNode<unknown>,
  registry?: JSXRegistry | null,
  overrideDocument?: Document
): Promise<HostElements> {
  const waitOn: AsyncHostElementPromises = [];
  let firstChild = host.firstChild;
  while (firstChild && firstChild.nodeType > NodeType.COMMENT_NODE) {
    firstChild = firstChild.nextSibling;
  }
  visitJSXNode(overrideDocument || document, waitOn, registry || null, host, firstChild, jsxNode);
  // TODO[type]: don't know how to make the type system happy, cheating with `any` cast.
  return flattenPromiseTree<HTMLElement>(waitOn as any);
}

function visitJSXNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  registry: JSXRegistry | null,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<unknown>
): Node | null {
  if (typeof jsxNode.tag === 'string') {
    // String literal
    return visitJSXStringNode(
      document,
      waitOn,
      registry,
      parentNode,
      existingNode,
      jsxNode as JSXNode<string>
    );
  } else if (typeof jsxNode.tag === 'function') {
    // Symbol reference
    return visitJSXFactoryNode(
      document,
      waitOn,
      registry,
      parentNode,
      existingNode,
      jsxNode as JSXNode<JSXFactory>
    );
  } else if (jsxNode.tag === null) {
    // Fragment
    return visitJSXFragmentNode(
      document,
      waitOn,
      registry,
      parentNode,
      existingNode,
      jsxNode as JSXNode<null>
    );
  }
  throw new Error('Unexpected JSXNode<' + jsxNode.tag + '> type.');
}

function visitJSXStringNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  registry: JSXRegistry | null,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<string>
): Node | null {
  const jsxTag = jsxNode.tag;
  let reconcileElement: Element;
  let inputPropChangesDetected = false;
  if (isDomElementWithTagName(existingNode, jsxTag)) {
    // We already have the right element so we need to reuse it.
    reconcileElement = existingNode;
  } else {
    // No match we need to create a new DOM element (and remove the old one)
    reconcileElement = replaceNode(parentNode, existingNode, document.createElement(jsxTag));
    inputPropChangesDetected = true;
  }
  const componentUrl = getComponentUrl(jsxNode);
  const shouldDetectChanges = !!componentUrl;
  inputPropChangesDetected =
    applyAttributes(reconcileElement, jsxNode.props, shouldDetectChanges) ||
    inputPropChangesDetected;
  if (componentUrl && inputPropChangesDetected) {
    // we need to render child component only if the inputs to the component changed.
    const component = registry && registry[componentUrl!];
    if (component) {
      waitOn.push(reconcileElement);
      return visitJSXNode(
        document,
        waitOn,
        registry,
        reconcileElement,
        reconcileElement.firstChild,
        component(jsxNode.props)
      );
    } else {
      const componentOrPromise = qImport<JSXFactory>(reconcileElement, componentUrl);
      if (isPromise(componentOrPromise)) {
        waitOn.push(
          componentOrPromise.then((component) => {
            const waitOn = [reconcileElement];
            visitJSXComponentNode(
              document,
              waitOn,
              registry,
              reconcileElement,
              reconcileElement.firstChild,
              component,
              jsxNode
            );
            return waitOn;
          })
        );
      } else {
        visitJSXComponentNode(
          document,
          waitOn,
          registry,
          reconcileElement,
          reconcileElement.firstChild,
          componentOrPromise,
          jsxNode
        );
      }
    }
  }
  if (!componentUrl) {
    // we don't process children if we have a component, as component is responsible for projection.
    visitChildren(
      document,
      waitOn,
      registry,
      reconcileElement,
      reconcileElement.firstChild,
      jsxNode.children
    );
  }
  return reconcileElement;
}

function visitJSXComponentNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  registry: JSXRegistry | null,
  parentNode: Node,
  existingNode: Node | null,
  component: JSXFactory,
  jsxNode: JSXNode<string>
): Node | null {
  const componentJsxNode = component(jsxNode.props || EMPTY_OBJ);
  return visitJSXNode(document, waitOn, registry, parentNode, existingNode, componentJsxNode);
}

function getComponentUrl(jsxNode: JSXNode<unknown>): string | null {
  const qProps = jsxNode.props?.$ as { ['::']: string | undefined } | undefined;
  return (qProps && qProps['::']) || null;
}

function visitJSXFactoryNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  registry: JSXRegistry | null,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<JSXFactory>
): Node | null {
  return visitJSXNode(
    document,
    waitOn,
    registry,
    parentNode,
    existingNode,
    jsxNode.tag(jsxNode.props)
  );
}

function visitJSXFragmentNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  registry: JSXRegistry | null,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<null>
): Node | null {
  return visitChildren(document, waitOn, registry, parentNode, existingNode, jsxNode.children);
}

function visitChildren(
  document: Document,
  waitOn: AsyncHostElementPromises,
  registry: JSXRegistry | null,
  parentNode: Node,
  existingNode: Node | null,
  jsxChildren: any[]
): Element | null {
  if (jsxChildren) {
    for (let i = 0; i < jsxChildren.length; i++) {
      const jsxChild = jsxChildren[i];
      if (isJSXNode(jsxChild)) {
        existingNode = visitJSXNode(document, waitOn, registry, parentNode, existingNode, jsxChild);
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
          replaceNode(parentNode, existingNode, document.createTextNode(String(jsxChild)));
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
