/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {JSXNode} from './factory.js';
import {JSXRegistry} from './registry.js';

export function jsxRender(
    document: Document, host: Node, jsxNode: JSXNode, registry: JSXRegistry) {
  processNode(document, host, jsxNode, registry);
}

function processNode(
    document: Document, parentNode: Node, jsxNode: JSXNode,
    registry: JSXRegistry): void {
  const tag = jsxNode.tag;
  let currentParent = parentNode;
  if (typeof tag === 'string') {
    const node = currentParent = document.createElement(tag);
    parentNode.appendChild(node);

    const props = jsxNode.props;

    const componentFactory = registry[tag];
    if (componentFactory) {
      const fragment = componentFactory(props || {});
      processNode(document, node, fragment, registry);
    }

    if (props) {
      for (const key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) {
          const value = props[key];
          node.setAttribute(key, value);
        }
      }
    }
  }
  jsxNode.children.forEach((child) => {
    if (typeof child === 'string') {
      currentParent.appendChild(document.createTextNode(child));
    } else if (child) {
      processNode(document, currentParent, child, registry);
    }
  });
}