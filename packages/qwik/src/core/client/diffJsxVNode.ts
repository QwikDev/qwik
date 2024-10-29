import type { JSXNode, _ElementVNode, _TextVNode, _VNode } from '@qwik.dev/core';
import { Fragment } from '@qwik.dev/core';
import {
  vnode_getAttr,
  vnode_getAttrKeys,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getNode,
  vnode_getText,
  vnode_isElementVNode,
  vnode_isTextVNode,
  vnode_isVirtualVNode,
} from './vnode';
import { serializeBooleanOrNumberAttribute } from '../shared/utils/styles';
import { isHtmlAttributeAnEventName, isJsxPropertyAnEventName } from '../shared/utils/event-names';
import { Q_PROPS_SEPARATOR } from '../shared/utils/markers';
import { attrsEqual, getJSXChildren, jsxToHTML, tagToString } from './diffJsx-utils';

export function getVNodeChildren(vNode: _VNode): _VNode[] {
  const children: _VNode[] = [];
  let child = vnode_getFirstChild(vNode);
  while (child) {
    if (!shouldSkip(child)) {
      children.push(child);
    }
    child = vnode_getNextSibling(child);
  }
  return children;
}

export function diffJsxVNode(
  received: _VNode,
  expected: JSXNode | string,
  path: string[] = []
): string[] {
  if (!received) {
    return [path.join(' > ') + ' missing'];
  }
  const diffs: string[] = [];
  if (typeof expected === 'string') {
    const receivedText = vnode_isTextVNode(received) ? vnode_getText(received as _TextVNode) : null;
    if (expected !== receivedText) {
      diffs.push(path.join(' > '));
      diffs.push('EXPECTED', JSON.stringify(expected));
      diffs.push('RECEIVED:', JSON.stringify(receivedText));
    }
  } else {
    path.push(tagToString(expected.type));
    const receivedTag = vnode_isElementVNode(received)
      ? vnode_getElementName(received as _ElementVNode)
      : vnode_isVirtualVNode(received)
        ? Fragment
        : undefined;
    const isTagSame = String(expected.type).toLowerCase() == String(receivedTag).toLowerCase();
    if (!isTagSame) {
      diffs.push(path.join(' > ') + ' expecting=' + expected.type + ' received=' + receivedTag);
    }
    const allProps: string[] = [];
    expected.varProps && propsAdd(allProps, Object.keys(expected.varProps));
    expected.constProps && propsAdd(allProps, Object.keys(expected.constProps));
    const receivedElement = vnode_isElementVNode(received)
      ? (vnode_getNode(received) as Element)
      : null;
    propsAdd(allProps, vnode_isElementVNode(received) ? vnode_getAttrKeys(received).sort() : []);
    receivedElement && propsAdd(allProps, constPropsFromElement(receivedElement));
    allProps.sort();
    allProps.forEach((prop) => {
      if (isJsxPropertyAnEventName(prop) || isHtmlAttributeAnEventName(prop)) {
        return;
      }
      // we need this, because Domino lowercases all attributes for `element.attributes`
      const propLowerCased = prop.toLowerCase();
      let receivedValue =
        vnode_getAttr(received, prop) ||
        vnode_getAttr(received, propLowerCased) ||
        receivedElement?.getAttribute(prop) ||
        receivedElement?.getAttribute(propLowerCased);
      let expectedValue =
        prop === 'key' || prop === 'q:key' ? (expected.key ?? receivedValue) : expected.props[prop];
      if (typeof receivedValue === 'boolean' || typeof receivedValue === 'number') {
        receivedValue = serializeBooleanOrNumberAttribute(receivedValue);
      }
      if (typeof expectedValue === 'number') {
        expectedValue = serializeBooleanOrNumberAttribute(expectedValue);
      }
      if (!attrsEqual(expectedValue, receivedValue)) {
        diffs.push(`${path.join(' > ')}: [${prop}]`);
        diffs.push('  EXPECTED: ' + JSON.stringify(expectedValue));
        diffs.push('  RECEIVED: ' + JSON.stringify(receivedValue));
      }
    });
    const receivedChildren = getVNodeChildren(received);
    const expectedChildren = getJSXChildren(expected);
    if (receivedChildren.length === expectedChildren.length) {
      for (let i = 0; i < receivedChildren.length; i++) {
        const receivedChild = receivedChildren[i];
        const expectedChild = expectedChildren[i];
        diffs.push(...diffJsxVNode(receivedChild, expectedChild, path));
      }
    } else {
      diffs.push(
        `${path.join(' > ')} expecting ${expectedChildren.length} children but was ${receivedChildren.length}`
      );
      diffs.push('EXPECTED', jsxToHTML(expected, '  '));
      diffs.push('RECEIVED:', vnodeToHTML(received, '  '));
    }
    path.pop();
  }
  return diffs;
}

function vnodeToHTML(vNode: _VNode | null, pad: string = ''): string {
  const html: string[] = [];
  while (vNode) {
    html.push(
      pad +
        vNode
          .toString()
          .split('\n')
          .join('\n' + pad)
    );
    while (shouldSkip((vNode = vnode_getNextSibling(vNode!)))) {
      // skip
    }
  }
  return html.join('');
}

function propsAdd(existing: string[], incoming: string[]) {
  for (const prop of incoming) {
    if (prop !== 'children') {
      let found = false;
      for (let i = 0; i < existing.length; i++) {
        if (existing[i].toLowerCase() === prop.toLowerCase()) {
          found = true;
          break;
        }
      }
      if (!found) {
        existing.push(prop);
      }
    }
  }
}

function constPropsFromElement(element: Element) {
  const props: string[] = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr.name !== '' && attr.name !== Q_PROPS_SEPARATOR) {
      props.push(attr.name);
    }
  }
  props.sort();
  return props;
}

function shouldSkip(vNode: _VNode | null) {
  if (vNode && vnode_isElementVNode(vNode)) {
    const tag = vnode_getElementName(vNode);
    if (
      tag === 'script' &&
      (vnode_getAttr(vNode, 'type') === 'qwik/vnode' ||
        vnode_getAttr(vNode, 'type') === 'x-qwik/vnode' ||
        vnode_getAttr(vNode, 'type') === 'qwik/state')
    ) {
      return true;
    }
  }
  return false;
}
