/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { AttributeMarker } from '../../util/markers';
import { QError, qError } from '../../error/error';
import { qImport } from '../../import/index';
import type { QRL } from '../../import/qrl';
import { getInjector } from '../../injector/element_injector';
import type { InjectedFunction, Injector, Props } from '../../injector/types';
import { removeNode, replaceNode } from '../../util/dom';
import { EMPTY_OBJ } from '../../util/flyweight';
import { flattenPromiseTree, isPromise } from '../../util/promises';
import { isDomElementWithTagName, isTextNode, NodeType } from '../../util/types';
import type { AsyncHostElementPromises, HostElements } from '../types';
import { applyAttributes } from './attributes';
import { Fragment, isJSXNode } from './jsx-runtime';
import { Host } from './host';
import type { JSXFactory, JSXNode } from './types';

/**
 * Render JSX into a host element reusing DOM nodes when possible.
 *
 * @param host - Host element which will act as a parent to `jsxNode`. When
 *     possible the rendering will try to reuse existing nodes.
 * @param jsxNode - JSX to render
 * @public
 */
export async function jsxRender(
  host: Element | Document,
  jsxNode: JSXNode<unknown>
): Promise<HostElements> {
  const waitOn: AsyncHostElementPromises = [];
  let firstChild = host.firstChild;
  while (firstChild && firstChild.nodeType > NodeType.COMMENT_NODE) {
    firstChild = firstChild.nextSibling;
  }
  visitJSXNode(host.ownerDocument! || host, waitOn, host, firstChild, jsxNode);
  // TODO[type]: don't know how to make the type system happy, cheating with `any` cast.
  return flattenPromiseTree<HTMLElement>(waitOn as any);
}

function visitJSXNode(
  doc: Document,
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
        const node = visitJSXNode(doc, waitOn, parentNode, existingNode, jsxNode);
        // TODO: cast seems suspect;
        node && waitOn.push(node as Element);
        // TODO: needs test
        return waitOn;
      }, writeErrorToDom(parentNode))
    );
    return null;
  } else if (typeof jsxNode.type === 'string') {
    // String literal
    return visitJSXDomNode(doc, waitOn, parentNode, existingNode, jsxNode as JSXNode<string>);
  } else if (jsxNode.type === Host) {
    return visitJSXHostNode(doc, waitOn, parentNode, existingNode, jsxNode as JSXNode<JSXFactory>);
  } else if (typeof jsxNode.type === 'function') {
    // Symbol reference
    return visitJSXNode(doc, waitOn, parentNode, existingNode, jsxNode.type(jsxNode.props));
  } else if (jsxNode.type === Fragment || jsxNode.type == null) {
    // Fragment
    return visitChildren(doc, waitOn, parentNode, existingNode, jsxNode.children);
  }
  throw qError(QError.Render_unexpectedJSXNodeType_type, jsxNode.type);
}

function visitJSXDomNode(
  doc: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<string>
): Node | null {
  const jsxTag = jsxNode.type as string;
  let reconcileElement: Element;
  let inputPropChangesDetected = false;
  if (isDomElementWithTagName(existingNode, jsxTag)) {
    // We already have the right element so we need to reuse it.
    reconcileElement = existingNode;
  } else {
    // No match we need to create a new DOM element (and remove the old one)
    reconcileElement = replaceNode(parentNode, existingNode, doc.createElement(jsxTag));
    inputPropChangesDetected = true;
  }
  const componentUrl = getComponentTemplateUrl(jsxNode);
  const shouldDetectChanges = !!componentUrl;
  inputPropChangesDetected =
    applyAttributes(reconcileElement, jsxNode.props, shouldDetectChanges) ||
    inputPropChangesDetected;
  if (componentUrl && inputPropChangesDetected) {
    // TODO: better way of converting string to QRL.
    jsxRenderComponent(doc, reconcileElement, componentUrl as any as QRL, waitOn, jsxNode.props);
  }
  if (!componentUrl && !('innerHTML' in jsxNode.props || 'innerText' in jsxNode.props)) {
    // we don't process children if we have a component, as component is responsible for projection.
    visitChildren(doc, waitOn, reconcileElement, reconcileElement.firstChild, jsxNode.children);
  }
  return reconcileElement;
}

export function jsxRenderComponent(
  doc: Document,
  hostElement: Element,
  componentUrl: QRL,
  waitOn: AsyncHostElementPromises,
  props: Props
) {
  // we need to render child component only if the inputs to the component changed.
  const componentOrPromise = qImport<JSXFactory>(hostElement, componentUrl);
  if (isPromise(componentOrPromise)) {
    waitOn.push(
      componentOrPromise.then((component) => {
        const waitOn = [hostElement];
        visitJSXComponentNode(doc, waitOn, hostElement, hostElement.firstChild, component, props);
        return waitOn;
      })
    );
  } else {
    visitJSXComponentNode(
      doc,
      waitOn,
      hostElement,
      hostElement.firstChild,
      componentOrPromise,
      props
    );
  }
}

function visitJSXComponentNode(
  doc: Document,
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
    component as any as InjectedFunction<any, any[], any[], JSXNode<any>>,
    undefined,
    props
  );
  return visitJSXNode(doc, waitOn, parentNode, existingNode, componentJsxNode);
}

function getComponentTemplateUrl(jsxNode: JSXNode<unknown>): string | null {
  const props = jsxNode.props || EMPTY_OBJ;
  return props[AttributeMarker.ComponentTemplate] || null;
}

function visitJSXHostNode(
  doc: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  jsxNode: JSXNode<JSXFactory>
): Node | null {
  applyAttributes(parentNode as HTMLElement, jsxNode.props, false);
  visitChildren(doc, waitOn, parentNode, existingNode, jsxNode.children);
  return parentNode;
}

function visitChildren(
  doc: Document,
  waitOn: AsyncHostElementPromises,
  parentNode: Node,
  existingNode: Node | null,
  jsxChildren: any[]
): Element | null {
  if (jsxChildren) {
    for (const jsxChild of jsxChildren) {
      if (isJSXNode(jsxChild)) {
        existingNode = visitJSXNode(doc, waitOn, parentNode, existingNode, jsxChild);
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
          replaceNode(parentNode, existingNode, doc.createTextNode(String(jsxChild)));
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
    // eslint-disable-next-line no-console
    console.error('ERROR:', error);
    const element = node as Element;
    const pre = element.ownerDocument.createElement('pre');
    element.appendChild(pre);
    pre.textContent = String(error);
    return Promise.reject(error);
  };
}
