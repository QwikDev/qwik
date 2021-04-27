/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QError, qError } from '../../error/error.js';
import { qImport } from '../../import/index.js';
import { QRL } from '../../import/qrl.js';
import { getInjector } from '../../injector/element_injector.js';
import { InjectedFunction, Injector, Props } from '../../injector/types.js';
import { removeNode, replaceNode } from '../../util/dom.js';
import { EMPTY_OBJ } from '../../util/flyweight.js';
import { flattenPromiseTree, isPromise } from '../../util/promises.js';
import '../../util/qDev.js';
import { isDomElementWithTagName, isTextNode, NodeType } from '../../util/types.js';
import { AsyncHostElementPromises, HostElements } from '../types.js';
import { applyAttributes } from './attributes.js';
import { isJSXNode } from './factory.js';
import { Host } from './host.js';
import { JSXFactory, JSXNode } from './types.js';

/**
 * Render JSX into a host element reusing DOM nodes when possible.
 *
 * @param host - Host element which will act as a parent to `jsxNode`. When
 *     possible the rendering will try to reuse existing nodes.
 * @param jsxNode - JSX to render
 * @param overrideDocument - optional document used for creating new DOM nodes
 *     (used global `document` otherwise)
 * @public
 */
export async function jsxRender(
  host: Element | Document,
  jsxNode: JSXNode<unknown>,
  overrideDocument?: Document
): Promise<HostElements> {
  const waitOn: AsyncHostElementPromises = [];
  let firstChild = host.firstChild;
  while (firstChild && firstChild.nodeType > NodeType.COMMENT_NODE) {
    firstChild = firstChild.nextSibling;
  }
  visitJSXNode(overrideDocument || document, waitOn, host, firstChild, jsxNode);
  // TODO[type]: don't know how to make the type system happy, cheating with `any` cast.
  return flattenPromiseTree<HTMLElement>(waitOn as any);
}

function visitJSXNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: Promise<JSXNode<unknown>> | JSXNode<unknown>
): Node | null {
  if (!jsxNode) return null;
  if (isPromise(jsxNode)) {
    waitOn.push(
      jsxNode.then((jsxNode) => {
        const waitOn: AsyncHostElementPromises = [];
        const node = visitJSXNode(document, waitOn, parentNode, existingNode, jsxNode);
        // TODO: cast seems suspect;
        node && waitOn.push(node as Element);
        // TODO: needs test
        return waitOn;
      }, writeErrorToDom(parentNode))
    );
    return null;
  } else if (typeof jsxNode.tag === 'string') {
    // String literal
    return visitJSXDomNode(document, waitOn, parentNode, existingNode, jsxNode as JSXNode<string>);
  } else if (jsxNode.tag === Host) {
    return visitJSXHostNode(
      document,
      waitOn,
      parentNode,
      existingNode,
      jsxNode as JSXNode<JSXFactory>
    );
  } else if (typeof jsxNode.tag === 'function') {
    // Symbol reference
    return visitJSXFactoryNode(
      document,
      waitOn,
      parentNode,
      existingNode,
      jsxNode as JSXNode<JSXFactory>
    );
  } else if (jsxNode.tag === null) {
    // Fragment
    return visitJSXFragmentNode(
      document,
      waitOn,
      parentNode,
      existingNode,
      jsxNode as JSXNode<null>
    );
  }
  throw qError(QError.Render_unexpectedJSXNodeType_type, jsxNode.tag);
}

function visitJSXDomNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
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
    // TODO: better way of converting string to QRL.
    jsxRenderComponent(
      reconcileElement,
      (componentUrl as any) as QRL,
      waitOn,
      jsxNode.props,
      document
    );
  }
  if (!componentUrl && !('innerHTML' in jsxNode.props || 'innerText' in jsxNode.props)) {
    // we don't process children if we have a component, as component is responsible for projection.
    visitChildren(
      document,
      waitOn,
      reconcileElement,
      reconcileElement.firstChild,
      jsxNode.children
    );
  }
  return reconcileElement;
}

export function jsxRenderComponent(
  hostElement: Element,
  componentUrl: QRL,
  waitOn: AsyncHostElementPromises,
  props: Props,
  overrideDocument: Document = document
) {
  // we need to render child component only if the inputs to the component changed.
  const componentOrPromise = qImport<JSXFactory>(hostElement, componentUrl);
  if (isPromise(componentOrPromise)) {
    waitOn.push(
      componentOrPromise.then((component) => {
        const waitOn = [hostElement];
        visitJSXComponentNode(
          overrideDocument,
          waitOn,
          hostElement,
          hostElement.firstChild,
          component,
          props
        );
        return waitOn;
      })
    );
  } else {
    visitJSXComponentNode(
      overrideDocument,
      waitOn,
      hostElement,
      hostElement.firstChild,
      componentOrPromise,
      props
    );
  }
}

function visitJSXComponentNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  component: JSXFactory,
  props: Props
): Node | null {
  if (!props) props = EMPTY_OBJ;
  const injector: Injector = getInjector(parentNode as Element);
  injector.elementProps = props;
  const componentJsxNode = injector.invoke(
    (component as any) as InjectedFunction<any, any[], any[], JSXNode<any>>,
    undefined,
    props
  );
  return visitJSXNode(document, waitOn, parentNode, existingNode, componentJsxNode);
}

function getComponentUrl(jsxNode: JSXNode<unknown>): string | null {
  const qProps = (jsxNode.props?.$ as unknown) as { ['::']: string | undefined } | undefined;
  return (qProps && qProps['::']) || null;
}

function visitJSXFactoryNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<JSXFactory>
): Node | null {
  return visitJSXNode(document, waitOn, parentNode, existingNode, jsxNode.tag(jsxNode.props));
}

function visitJSXHostNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<JSXFactory>
): Node | null {
  applyAttributes(parentNode as HTMLElement, jsxNode.props, false);
  visitChildren(document, waitOn, parentNode, existingNode, jsxNode.children);
  return parentNode;
}

function visitJSXFragmentNode(
  document: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<null>
): Node | null {
  return visitChildren(document, waitOn, parentNode, existingNode, jsxNode.children);
}

function visitChildren(
  document: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  jsxChildren: any[]
): Element | null {
  if (jsxChildren) {
    for (let i = 0; i < jsxChildren.length; i++) {
      const jsxChild = jsxChildren[i];
      if (isJSXNode(jsxChild)) {
        existingNode = visitJSXNode(document, waitOn, parentNode, existingNode, jsxChild);
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

// TODO: docs
// TODO: tests
function writeErrorToDom(node: Node): any {
  return function (error: any): any {
    // TODO: needs test
    console.log('ERROR:', error);
    const element = node as Element;
    const pre = element.ownerDocument.createElement('pre');
    element.appendChild(pre);
    pre.textContent = String(error);
    return Promise.reject(error);
  };
}
