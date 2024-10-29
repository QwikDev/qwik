import type { JSXNode } from '@qwik.dev/core';
import { Fragment, Slot } from '@qwik.dev/core';

export function tagToString(tag: any): string {
  return tag === Fragment ? 'Fragment' : tag === Slot ? 'Slot' : String(tag);
}

export function attrsEqual(expectedValue: any, receivedValue: any) {
  const isEqual =
    typeof expectedValue == 'boolean'
      ? expectedValue
        ? receivedValue !== null
        : receivedValue === null || receivedValue === 'false'
      : expectedValue == receivedValue;
  // console.log('attrsEqual', expectedValue, receivedValue, isEqual);
  return isEqual;
}

export function getJSXChildren(jsx: JSXNode): JSXNode[] {
  const children = jsx.children;
  if (Array.isArray(children)) {
    return children as any;
  } else if (children != null) {
    return [children] as any;
  }
  return [];
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
