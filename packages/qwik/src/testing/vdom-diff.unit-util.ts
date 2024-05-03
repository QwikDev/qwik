import { expect } from 'vitest';
import { Fragment, _isJSXNode, _isStringifiable, isSignal } from '@builder.io/qwik';
import type {
  JSXNode,
  JSXOutput,
  _ElementVNode,
  _QDocument,
  _Stringifiable,
  _TextVNode,
  _VNode,
  _VirtualVNode,
} from '@builder.io/qwik';
import {
  vnode_applyJournal,
  vnode_getAttr,
  vnode_getAttrKeys,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getNode,
  vnode_getParent,
  vnode_getText,
  vnode_insertBefore,
  vnode_isElementVNode,
  vnode_isTextVNode,
  vnode_isVirtualVNode,
  vnode_newText,
  vnode_newUnMaterializedElement,
  vnode_setAttr,
  type VNodeJournal,
} from '../core/v2/client/vnode';

import { format } from 'prettier';
import { serializeBooleanOrNumberAttribute } from '../core/render/execute-component';
import { isText } from '../core/util/element';
import {
  isHtmlAttributeAnEventName,
  isJsxPropertyAnEventName,
} from '../core/v2/shared/event-names';
import { createDocument } from './document';
import { isElement } from './html';

expect.extend({
  toMatchVDOM(this: { isNot: boolean }, received: _VNode, expected: JSXNode) {
    const { isNot } = this;
    const diffs = diffJsxVNode(received, expected);
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
    const diffs = await diffNode(received, expected);
    return {
      pass: isNot ? diffs.length !== 0 : diffs.length === 0,
      message: () => diffs.join('\n'),
    };
  },
});

function diffJsxVNode(received: _VNode, expected: JSXNode | string, path: string[] = []): string[] {
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
      let receivedValue = vnode_getAttr(received, prop) || receivedElement?.getAttribute(prop);
      let expectedValue =
        prop === 'key' || prop === 'q:key' ? expected.key ?? receivedValue : expected.props[prop];
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
        `${path.join(' > ')} expecting ${expectedChildren.length} children but was ${
          receivedChildren.length
        }`
      );
      diffs.push('EXPECTED', jsxToHTML(expected, '  '));
      diffs.push('RECEIVED:', vnodeToHTML(received, '  '));
    }
    path.pop();
  }
  return diffs;
}
function getJSXChildren(jsx: JSXNode): JSXNode[] {
  const children = jsx.children;
  if (Array.isArray(children)) {
    return children as any;
  } else if (children != null) {
    return [children] as any;
  }
  return [];
}

function getVNodeChildren(vNode: _VNode): _VNode[] {
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
export function jsxToHTML(jsx: JSXNode, pad: string = ''): string {
  const html: string[] = [];
  if (jsx.type) {
    html.push(pad, '<', tagToString(jsx.type), '>\n');
    getJSXChildren(jsx).forEach((jsx) => {
      html.push(jsxToHTML(jsx, pad + '  '));
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
    while (shouldSkip((vNode = vnode_getNextSibling(vNode!)))) {
      // skip
    }
  }
  return html.join('');
}

function tagToString(tag: any): string {
  if (tag === Fragment) {
    return 'Fragment';
  }
  return String(tag);
}

function shouldSkip(vNode: _VNode | null) {
  if (vNode && vnode_isElementVNode(vNode)) {
    const tag = vnode_getElementName(vNode);
    if (
      tag === 'script' &&
      (vnode_getAttr(vNode, 'type') === 'qwik/vnode' ||
        vnode_getAttr(vNode, 'type') === 'qwik/state')
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
    enter: (jsx: JSXNode) => void;
    leave: (jsx: JSXNode) => void;
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
  doc.qVNodeData = new WeakMap();
  const vBody = vnode_newUnMaterializedElement(doc.body);
  let vParent: _ElementVNode | _VirtualVNode = vBody;
  const journal: VNodeJournal = [];
  walkJSX(jsx, {
    enter: (jsx) => {
      const type = jsx.type;
      if (typeof type === 'string') {
        const child = vnode_newUnMaterializedElement(doc.createElement(type));
        vnode_insertBefore(journal, vParent, child, null);

        // TODO(hack): jsx.props is an empty object
        const props = jsx.varProps;
        for (const key in props) {
          if (Object.prototype.hasOwnProperty.call(props, key)) {
            vnode_setAttr(journal, child, key, String(props[key]));
          }
        }
        if (jsx.key != null) {
          vnode_setAttr(journal, child, 'q:key', String(jsx.key));
        }
        vParent = child;
      } else {
        throw new Error('Unknown type:' + type);
      }
    },
    leave: (jsx) => {
      vParent = vnode_getParent(vParent) as any;
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
  vnode_applyJournal(journal);
  return { vParent, vNode: vnode_getFirstChild(vParent), document: doc };
}
function constPropsFromElement(element: Element) {
  const props: string[] = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr.name !== '' && attr.name !== ':') {
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

async function diffNode(received: HTMLElement, expected: JSXOutput): Promise<string[]> {
  const diffs: string[] = [];
  const nodePath: (Node | null)[] = [received];
  const path: string[] = [];
  walkJSX(expected, {
    enter: async (jsx) => {
      // console.log('enter', jsx.type);
      const element = nodePath[nodePath.length - 1] as HTMLElement;
      if (!element) {
        diffs.push(path.join(' > ') + ': expecting element');
        diffs.push('  RECEIVED: nothing ');
        return;
      }
      if (isText(element)) {
        diffs.push(path.join(' > ') + ': expecting element');
        diffs.push('  RECEIVED: #text ' + element.textContent);
        return;
      }
      if (!isElement(element)) {
        diffs.push(path.join(' > ') + ': expecting element');
        diffs.push('  RECEIVED: ' + String(element));
        return;
      }
      if (jsx.type !== element.tagName.toLowerCase()) {
        diffs.push(
          path.join(' > ') + `: expecting=${jsx.type} received=${element.tagName.toLowerCase()}`
        );
      }
      path.push(jsx.type as string);
      const entries = Object.entries(jsx.varProps);
      if (jsx.constProps) {
        entries.push(...Object.entries(jsx.constProps));
      }
      if (jsx.key) {
        entries.push(['q:key', jsx.key]);
      }
      entries.forEach(([expectedKey, expectedValue]) => {
        let receivedValue = element.getAttribute(expectedKey);
        if (typeof receivedValue === 'boolean' || typeof receivedValue === 'number') {
          receivedValue = serializeBooleanOrNumberAttribute(receivedValue);
        }
        if (typeof expectedValue === 'number') {
          expectedValue = serializeBooleanOrNumberAttribute(expectedValue);
        }
        if (!attrsEqual(expectedValue, receivedValue)) {
          diffs.push(path.join(' > ') + `: [${expectedKey}]`);
          diffs.push('  EXPECTED: ' + JSON.stringify(expectedValue));
          diffs.push('  RECEIVED: ' + JSON.stringify(receivedValue));
        }
      });
      const expectedChildren = getJSXChildren(jsx);

      const receivedChildren = combineAdjacentTextNodes(
        Array.from(element.childNodes),
        expectedChildren.length === 0
      );
      if (receivedChildren.length !== expectedChildren.length) {
        diffs.push(
          `${path.join(' > ')} expecting ${expectedChildren.length} children but was ${
            receivedChildren.length
          }`
        );
        diffs.push('EXPECTED', jsxToHTML(jsx, '  '));
        diffs.push('RECEIVED:', await format(element.outerHTML, formatOptions));
      }
      nodePath.push(element.firstChild);
    },
    leave: () => {
      // console.log('leave');
      nodePath.pop();
      const parentNode = nodePath[nodePath.length - 1] as HTMLElement;
      if (!parentNode) {
        diffs.push('  EXPECTED: (sibling)');
        diffs.push('  RECEIVED: (nothing)');
        return;
      }
      nodePath[nodePath.length - 1] = parentNode.nextSibling!;
      path.pop();
    },
    text: (expectText) => {
      // console.log('text', expectText);
      let node: Node | null = nodePath.pop()!;
      let receivedText = '';
      while (node && isText(node)) {
        receivedText += node.textContent;
        node = node.nextSibling;
      }
      nodePath.push(node);

      if (receivedText !== expectText) {
        diffs.push(path.join(' > '));
        diffs.push('EXPECTED', JSON.stringify(expectText));
        diffs.push('RECEIVED:', JSON.stringify(receivedText));
      }
    },
  });
  if (diffs.length) {
    const inputHTML = received.outerHTML.replaceAll(':=""', '');
    const html = await format(inputHTML, formatOptions);
    diffs.unshift('\n' + html);
  }
  return diffs;
}

function combineAdjacentTextNodes(arr: ChildNode[], removeEmptyTextNode: boolean) {
  const result: ChildNode[] = [];
  let textElement: ChildNode | null = null;

  for (let i = 0; i < arr.length; i++) {
    if (isText(arr[i])) {
      if (!textElement) {
        textElement = arr[i].cloneNode() as ChildNode;
      } else {
        textElement.textContent = (textElement.textContent || '') + arr[i].textContent;
      }
    } else {
      if (textElement) {
        result.push(textElement);
        textElement = null;
      }
      result.push(arr[i]);
    }
  }

  if (textElement) {
    result.push(textElement);
  }

  if (
    removeEmptyTextNode &&
    result.length === 1 &&
    isText(result[0]) &&
    result[0].textContent === ''
  ) {
    return [];
  }

  return result;
}

const formatOptions = { parser: 'html', htmlWhitespaceSensitivity: 'ignore' as const };
function attrsEqual(expectedValue: any, receivedValue: any) {
  const isEqual =
    typeof expectedValue == 'boolean'
      ? expectedValue
        ? receivedValue !== null
        : receivedValue === null || receivedValue === 'false'
      : expectedValue == receivedValue;
  // console.log('attrsEqual', expectedValue, receivedValue, isEqual);
  return isEqual;
}
