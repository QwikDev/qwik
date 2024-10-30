import type { JSXNode, JSXOutput, _Stringifiable } from '@qwik.dev/core';
import { _isJSXNode, _isStringifiable, isSignal } from '@qwik.dev/core';
import { format } from 'prettier';
import './extend-expect';
import { isElement } from './html';
import {
  attrsEqual,
  getJSXChildren,
  isText,
  jsxToHTML,
  serializeBooleanOrNumberAttribute,
} from './qwik-copy';

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

const formatOptions = { parser: 'html', htmlWhitespaceSensitivity: 'ignore' as const };

export async function diffNode(received: HTMLElement, expected: JSXOutput): Promise<string[]> {
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
        // we need this, because Domino lowercases all attributes for `element.attributes`
        const expectedKeyLowerCased = expectedKey.toLowerCase();
        let receivedValue =
          element.getAttribute(expectedKey) || element.getAttribute(expectedKeyLowerCased);
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
          `${path.join(' > ')} expecting ${expectedChildren.length} children but was ${receivedChildren.length}`
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

export function combineAdjacentTextNodes(arr: ChildNode[], removeEmptyTextNode: boolean) {
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
