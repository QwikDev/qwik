import { Fragment, Slot, _getDomContainer, isSignal, untrack } from '@qwik.dev/core';
import { _isJSXNode, _isStringifiable } from '@qwik.dev/core/internal';
import type { JSXChildren, JSXNode, JSXOutput } from '@qwik.dev/core';
import type {
  _ContainerElement,
  _ElementVNode,
  _QDocument,
  _Stringifiable,
  _TextVNode,
  _VNode,
  _VirtualVNode,
  JSXNodeInternal,
  ClientContainer,
} from '@qwik.dev/core/internal';
import { expect } from 'vitest';
import {
  type VNodeJournal,
  vnode_getAttrKeys,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getNode,
  vnode_getNodeTypeName,
  vnode_getProp,
  vnode_getText,
  vnode_insertBefore,
  vnode_isElementVNode,
  vnode_isTextVNode,
  vnode_isVirtualVNode,
  vnode_newText,
  vnode_newUnMaterializedElement,
  vnode_newVirtual,
  vnode_setAttr,
  vnode_setProp,
} from '../core/client/vnode-utils';

import { format } from 'prettier';
import { serializeAttribute, serializeBooleanOrNumberAttribute } from '../core/shared/utils/styles';
import {
  isHtmlAttributeAnEventName,
  isJsxPropertyAnEventName,
} from '../core/shared/utils/event-names';
import { createDocument } from './document';
import {
  ELEMENT_ID,
  ELEMENT_KEY,
  QRenderAttr,
  QBackRefs,
  Q_PROPS_SEPARATOR,
  QContainerAttr,
  debugStyleScopeIdPrefixAttr,
  ITERATION_ITEM,
} from '../core/shared/utils/markers';
import { HANDLER_PREFIX } from '../core/client/vnode-diff';
import { prettyJSX } from './jsx';
import { isElement, prettyHtml } from './html';
import { QContainerValue } from '../core/shared/types';
import type { VNode } from '../core/shared/vnode/vnode';
import { ElementVNode } from '../core/shared/vnode/element-vnode';
import type { VirtualVNode } from '../core/shared/vnode/virtual-vnode';
import { _flushJournal } from '../core/shared/cursor/cursor-flush';

expect.extend({
  toMatchVDOM(
    this: { isNot: boolean },
    received: _VNode,
    expected: JSXNodeInternal,
    isCsr?: boolean
  ) {
    const { isNot } = this;
    const container = getContainerElement(received);
    const isSsr = typeof isCsr === 'boolean' ? !isCsr : isSsrRenderer(container);
    const diffs = diffJsxVNode(received, expected, [], container, isSsr);
    return {
      pass: isNot ? diffs.length !== 0 : diffs.length === 0,
      message: () => diffs.join('\n'),
    };
  },

  async toMatchDOM(this: { isNot: boolean }, received: HTMLElement, expected: JSXOutput) {
    const { isNot } = this;
    if (!received) {
      return {
        pass: false,
        message: () => 'Missing element',
      };
    }
    if (!isElement(received)) {
      return {
        pass: false,
        message: () => 'Received is not an element',
      };
    }
    const receivedHTML = await format(prettyHtml(received), formatOptions);
    const expectedHTML = await format(prettyJSX(expected), formatOptions);
    return {
      pass: isNot ? receivedHTML !== expectedHTML : receivedHTML === expectedHTML,
      message: () => 'Expected HTML is not matching received HTML',
      actual: receivedHTML,
      expected: expectedHTML,
    };
  },
});

const ignoredAttributes = [
  QBackRefs,
  ELEMENT_ID,
  '',
  Q_PROPS_SEPARATOR,
  debugStyleScopeIdPrefixAttr,
  ITERATION_ITEM,
];

function getContainerElement(vNode: _VNode) {
  let maybeParent: _VNode | null;
  do {
    maybeParent = vNode.parent;
    if (maybeParent) {
      vNode = maybeParent;
    }
  } while (maybeParent);
  return vnode_getNode(vNode) as _ContainerElement;
}

function isSsrRenderer(container: _ContainerElement) {
  return container.hasAttribute(QRenderAttr);
}

function isSkippableNode(node: JSXNodeInternal): boolean {
  return node.type === Fragment && !node.constProps?.['ssr-required'];
}

function diffJsxVNode(
  received: _VNode,
  expected: JSXNodeInternal | string,
  path: string[] = [],
  container: _ContainerElement,
  isSsr: boolean
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
  } else if (
    isSsr &&
    expected.type !== Fragment &&
    vnode_getNodeTypeName(received) === 'Virtual' &&
    getVNodeChildren(container, received).length === 1
  ) {
    /**
     * We strip all the fragments from the expected output during SSR, because we're not sure which
     * Virtual components are being mapped. So here we skip Virtual components that don't have a
     * corresponding fragment.
     *
     * To make sure a Virtual component exists, add `ssr-required` to the expected fragment.
     */
    return diffJsxVNode(vnode_getFirstChild(received)!, expected, path, container, false);
  } else if (!isSsr || (isSsr && !isSkippableNode(expected))) {
    const receivedTag = vnode_isElementVNode(received)
      ? vnode_getElementName(received as _ElementVNode)
      : vnode_isVirtualVNode(received)
        ? Fragment
        : '...';
    const isTagSame = String(expected.type).toLowerCase() == String(receivedTag).toLowerCase();
    if (!isTagSame) {
      diffs.push(
        path.join(' > ') +
          ' expecting=' +
          tagToString(expected.type) +
          ' received=' +
          tagToString(receivedTag)
      );
    }
    const allProps: string[] = [];
    expected.varProps && propsAdd(allProps, Object.keys(expected.varProps));
    expected.constProps && propsAdd(allProps, Object.keys(expected.constProps));
    const receivedElement = vnode_isElementVNode(received)
      ? (vnode_getNode(received) as Element)
      : null;
    propsAdd(
      allProps,
      vnode_isElementVNode(received)
        ? vnode_getAttrKeys(received)
            .filter((key) => !ignoredAttributes.includes(key))
            .sort()
        : []
    );
    receivedElement && propsAdd(allProps, constPropsFromElement(receivedElement));

    path.push(tagToString(expected.type));

    allProps.sort();
    allProps.forEach((prop) => {
      if (isJsxPropertyAnEventName(prop) || isHtmlAttributeAnEventName(prop)) {
        return;
      }
      // we need this, because Domino lowercases all attributes for `element.attributes`
      const propLowerCased = prop.toLowerCase();
      let convertNullToUndefined = false;
      const vnodePropValue =
        stringifyAttribute(received, prop, vnode_getProp(received, prop, null)) ||
        stringifyAttribute(received, propLowerCased, vnode_getProp(received, propLowerCased, null));
      if (vnodePropValue === null) {
        convertNullToUndefined = true;
      }
      let receivedValue: string | boolean | undefined | null =
        vnodePropValue ||
        receivedElement?.getAttribute(prop) ||
        receivedElement?.getAttribute(propLowerCased);
      let expectedValue =
        prop === 'key' || prop === ELEMENT_KEY
          ? receivedValue
          : untrack(() => expected.props[prop]);
      if (typeof receivedValue === 'boolean' || typeof receivedValue === 'number') {
        receivedValue = serializeBooleanOrNumberAttribute(receivedValue);
      }
      if (convertNullToUndefined && receivedValue === null) {
        receivedValue = undefined;
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
    diffJsxVNodeChildren(received, expected, path, container, isSsr, diffs);
  } else if (isSsr && isSkippableNode(expected)) {
    diffJsxVNodeChildren(received, expected, path, container, isSsr, diffs);
  }
  return diffs;
}
function getJSXChildren(jsx: JSXNode): JSXChildren[] {
  const children = jsx.children;
  if (Array.isArray(children)) {
    return children as any;
  } else if (children != null) {
    return [children] as any;
  }
  return [];
}

function diffJsxVNodeChildren(
  received: _VNode,
  expected: JSXNode,
  path: string[],
  container: _ContainerElement,
  isSsr: boolean,
  diffs: string[]
) {
  const allExpectedChildren = getJSXChildren(expected);

  const expectedChildren = getFilteredJSXChildren(allExpectedChildren, isSsr, {
    mergedText: undefined,
  });

  if (_isJSXNode(expected)) {
    expected.children = expectedChildren;
  }

  const receivedChildren = getVNodeChildren(container, received);
  if (receivedChildren.length === expectedChildren.length) {
    for (let i = 0; i < receivedChildren.length; i++) {
      const receivedChild = receivedChildren[i];
      const expectedChild = expectedChildren[i];
      diffs.push(
        ...diffJsxVNode(receivedChild, expectedChild as JSXNodeInternal, path, container, isSsr)
      );
    }
  } else {
    diffs.push(
      `${path.join(' > ')} expecting ${expectedChildren.length} children but was ${
        receivedChildren.length
      }`
    );
    diffs.push('EXPECTED', jsxToHTML(expected, '  '));
    diffs.push('RECEIVED', received.toString());
  }
  path.pop();
}

function getFilteredJSXChildren(
  children: JSXChildren[],
  isSsr: boolean,
  data: {
    mergedText: string | undefined;
  }
): JSXChildren[] {
  const filteredChildren: JSXChildren[] = [];

  const pushMergedTextIfNeeded = () => {
    if (data.mergedText !== undefined) {
      filteredChildren.push(data.mergedText);
      data.mergedText = undefined;
    }
  };

  function processChildren(children: JSXChildren[]) {
    for (const child of children) {
      if (typeof child === 'string' || typeof child === 'number') {
        // skip empty strings
        if (child !== '') {
          data.mergedText =
            typeof data.mergedText === 'string' ? data.mergedText + child : String(child);
        }
        continue;
      }

      if (isSsr && _isJSXNode(child) && isSkippableNode(child)) {
        const skippedNodeChildren = getJSXChildren(child);
        processChildren(skippedNodeChildren);
      } else {
        pushMergedTextIfNeeded();
        filteredChildren.push(child);
      }
    }
  }

  processChildren(children);

  pushMergedTextIfNeeded();
  return filteredChildren;
}

function getVNodeChildren(container: _ContainerElement, vNode: _VNode): _VNode[] {
  const children: _VNode[] = [];
  let mergedText: string | undefined;

  const pushMergedTextIfNeeded = () => {
    if (mergedText !== undefined) {
      const mergedTextVNode = vnode_newText(
        container.ownerDocument!.createTextNode(mergedText),
        mergedText
      );
      children.push(mergedTextVNode);
      mergedText = undefined;
    }
  };

  let child = vnode_getFirstChild(vNode);
  while (child) {
    if (!shouldSkip(child)) {
      if (vnode_isTextVNode(child)) {
        const vnodeText = vnode_getText(child);
        if (vnodeText !== '') {
          if (mergedText === undefined) {
            mergedText = vnodeText;
          } else {
            mergedText += vnodeText;
          }
        }
        child = child.nextSibling as VNode | null;
        continue;
      }
      pushMergedTextIfNeeded();

      children.push(child);
    }
    child = child.nextSibling as VNode | null;
  }
  pushMergedTextIfNeeded();
  return children;
}

export function jsxToHTML(jsx: JSXNode, pad: string = ''): string {
  const html: string[] = [];
  if (jsx.type) {
    html.push(pad, '<', tagToString(jsx.type), '>\n');
    getJSXChildren(jsx).forEach((jsx) => {
      html.push(jsxToHTML(jsx as JSXNode, pad + '  '));
    });
    html.push(pad, '</', tagToString(jsx.type), '>\n');
  } else {
    html.push(pad, JSON.stringify(jsx), '\n');
  }
  return html.join('');
}

export function vnodeToHTML(vNode: _VNode | null, pad: string = ''): string {
  const html: string[] = [];
  while (vNode) {
    html.push(
      pad +
        vNode
          .toString()
          .split('\n')
          .join('\n' + pad)
    );
    while (shouldSkip((vNode = vNode!.nextSibling as VNode | null))) {
      // skip
    }
  }
  return html.join('');
}

function tagToString(tag: any): string {
  if (tag === Fragment) {
    return 'Fragment';
  }
  if (tag === Slot) {
    return 'Slot';
  }
  return String(tag);
}

function shouldSkip(vNode: _VNode | null) {
  if (vNode && vnode_isElementVNode(vNode)) {
    const tag = vnode_getElementName(vNode);
    if (
      tag === 'script' &&
      (vnode_getProp(vNode, 'type', null) === 'qwik/vnode' ||
        vnode_getProp(vNode, 'type', null) === 'x-qwik/vnode' ||
        vnode_getProp(vNode, 'type', null) === 'qwik/state')
    ) {
      return true;
    }
  }
  return false;
}

/** @public */
export function walkJSX(
  jsx: JSXOutput,
  apply: {
    enter: (jsx: JSXNodeInternal) => void;
    leave: (jsx: JSXNodeInternal) => void;
    text: (text: _Stringifiable) => void;
  }
) {
  if (_isJSXNode(jsx)) {
    apply.enter(jsx);
    if (Array.isArray(jsx.children)) {
      for (const child of jsx.children) {
        processChild(child);
      }
    } else if (jsx.children) {
      processChild(jsx.children);
    }
    apply.leave(jsx);
  } else if (typeof jsx === 'string') {
    apply.text(jsx);
  } else if (typeof jsx === 'number') {
    apply.text(String(jsx));
  } else {
    throw new Error('unsupported: ' + jsx);
  }

  function processChild(child: any) {
    if (isSignal(child)) {
      child = child.value;
    }
    if (_isStringifiable(child)) {
      apply.text(child);
    } else if (_isJSXNode(child)) {
      walkJSX(child, apply);
    } else {
      throw new Error('Unknown type: ' + child);
    }
  }
}

/** @public */
export function vnode_fromJSX(jsx: JSXOutput) {
  const doc = createDocument() as _QDocument;
  doc.documentElement.setAttribute(QContainerAttr, QContainerValue.RESUMED);
  doc.qVNodeData = new WeakMap();
  const container: ClientContainer = _getDomContainer(doc.body);
  const vBody = vnode_newUnMaterializedElement(doc.body);
  let vParent: _ElementVNode | _VirtualVNode = vBody;
  const journal: VNodeJournal = [];
  walkJSX(jsx, {
    enter: (jsx) => {
      const type = jsx.type;
      let child: VNode;
      if (typeof type === 'string') {
        child = vnode_newUnMaterializedElement(doc.createElement(type));
      } else if (typeof type === 'function') {
        if (type === Fragment) {
          child = vnode_newVirtual();
        } else {
          throw new Error('Unknown type:' + type);
        }
      } else {
        throw new Error('Unknown type:' + type);
      }

      vnode_insertBefore(journal, vParent, child, null);
      const props = jsx.varProps;
      for (const key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) {
          if (isJsxPropertyAnEventName(key)) {
            continue;
          }
          if (key.startsWith(HANDLER_PREFIX) || isHtmlAttributeAnEventName(key)) {
            vnode_setProp(child, key, props[key]);
          } else {
            vnode_setAttr(journal, child, key, String(props[key]));
          }
        }
      }
      if (jsx.key != null && vnode_isElementVNode(child)) {
        child.key = jsx.key;
      }
      vParent = child as ElementVNode | VirtualVNode;
    },
    leave: (_jsx) => {
      vParent = vParent.parent as any;
    },
    text: (value) => {
      vnode_insertBefore(
        journal,
        vParent,
        vnode_newText(doc.createTextNode(String(value)), String(value)),
        null
      );
    },
  });
  _flushJournal(journal);
  return { vParent, vNode: vnode_getFirstChild(vParent), document: doc, container };
}
function constPropsFromElement(element: Element) {
  const props: string[] = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (!ignoredAttributes.includes(attr.name)) {
      props.push(attr.name);
    }
  }
  props.sort();
  return props;
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

const formatOptions = { parser: 'html', htmlWhitespaceSensitivity: 'ignore' as const };
function attrsEqual(expectedValue: any, receivedValue: any) {
  const isEqual =
    typeof expectedValue == 'boolean'
      ? expectedValue
        ? receivedValue !== null
        : receivedValue == null || receivedValue === 'false'
      : expectedValue === receivedValue;
  // console.log('attrsEqual', expectedValue, receivedValue, isEqual);
  return isEqual;
}

function stringifyAttribute(vnode: VNode, key: string, value: any): string | null | boolean {
  if (isSignal(value)) {
    value = untrack(() => value.value);
  }
  const styleScopedId = vnode_getProp<string | null>(vnode, debugStyleScopeIdPrefixAttr, null);
  return serializeAttribute(key, value, styleScopedId);
}
