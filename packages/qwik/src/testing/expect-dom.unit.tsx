import type { QwikJSX } from '@builder.io/qwik';
import qwikDom from '@builder.io/qwik-dom';
import { isJSXNode } from '../core/render/jsx/jsx-runtime';
import { isComment, isElement, isText } from '../core/util/element';
import { isTemplateElement } from '../core/util/types';

export function expectDOM(
  actual: Element,
  expected: QwikJSX.Element,
  expectedErrors: string[] = []
) {
  const diffs: string[] = [];
  expectMatchElement('', diffs, actual, expected);
  expect(diffs).toEqual(expectedErrors);
}

function expectMatchElement(
  path: string,
  diffs: string[],
  actual: Element,
  expected: QwikJSX.Element,
  keepStyles = false
) {
  if (actual) {
    const actualTag = actual.localName ? actual.localName : '#text';
    path += actualTag;
    if (actualTag !== expected.type) {
      diffs.push(`${path}: expected '${toHTML(expected)}', was '${toHTML(actual)}'.`);
    }
    if (expected.props) {
      Object.keys(expected.props).forEach((key) => {
        if (key !== 'children') {
          const expectedValue = expected.props![key] as any;
          let actualValue = actual.getAttribute ? actual.getAttribute(key) : '';
          if (actualValue?.startsWith('/runtimeQRL#')) {
            actualValue = '/runtimeQRL#*';
          }
          if (!(actualValue == expectedValue || (expectedValue === true && actualValue !== null))) {
            diffs.push(`${path}: expected '${toHTML(expected)}', was '${toHTML(actual)}'.`);
          }
        }
      });
    }

    let actualChildNodes = Array.from(
      isTemplateElement(actual) ? actual.content.childNodes : actual.childNodes
    );

    if (!keepStyles) {
      actualChildNodes = actualChildNodes.filter((el) => el.nodeName !== 'STYLE');
    }

    (expected.children || []).forEach((expectedChild, index) => {
      const actualChild = actualChildNodes[index];
      if (expectedChild.text === undefined) {
        expectMatchElement(
          path + `.[${index}]`,
          diffs,
          actualChild as HTMLElement,
          expectedChild as any
        );
      } else {
        // We are a text node.
        const text = actualChild?.textContent || '';
        if (expectedChild.text !== text) {
          diffs.push(
            `${path}: expected content "${expectedChild.text}", was "${
              (actualChild as HTMLElement)?.outerHTML || actualChild?.textContent
            }"`
          );
        }
      }
    });
    for (let i = expected.children!.length; i < actualChildNodes.length; i++) {
      const childNode = actualChildNodes[i];
      diffs.push(`${path}[${i}]: extra node '${toHTML(childNode)}'`);
    }
  } else {
    diffs.push(`${path}: expected '${toHTML(expected)}', was no children`);
  }
}

function toAttrs(jsxNode: QwikJSX.Element): string[] {
  const attrs: string[] = [];
  if (jsxNode.props) {
    Object.keys(jsxNode.props || {}).forEach((key) => {
      if (key !== 'children') {
        attrs.push(key + '=' + JSON.stringify(jsxNode.props![key]));
      }
    });
  }
  return attrs;
}

function toHTML(node: any) {
  if (isElement(node)) {
    const attrs: string[] = [];
    const attributes = node.attributes;
    for (let i = 0; i < attributes.length; i++) {
      attrs.push(`${attributes[i].name}="${attributes[i].value}"`);
    }
    return `<${node.tagName.toLowerCase()}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  } else if (isText(node)) {
    return node.textContent;
  } else if (isJSXNode(node)) {
    const attrs = toAttrs(node);
    return `<${node.type}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  } else if (isComment(node)) {
    return `<!--${node.textContent}-->`;
  } else {
    throw new Error('Unexpected node type: ' + node);
  }
}

describe('expect-dom', () => {
  it('should match element', () => {
    expectDOM(toDOM('<span></span>'), <span></span>);
  });
  it('should match attributes element', () => {
    expectDOM(toDOM('<span title="abc" id="bar"></span>'), <span id="bar" title="abc"></span>);
  });

  describe('errors', () => {
    it('should detect missing attrs', () => {
      expectDOM(toDOM('<span></span>'), <span id="bar"></span>, [
        "span: expected '<span id=\"bar\">', was '<span>'.",
      ]);
    });
    it('should detect different tag attrs', () => {
      expectDOM(toDOM('<span></span>'), <div></div>, ["span: expected '<div>', was '<span>'."]);
    });
    it('should detect different text', () => {
      expectDOM(toDOM('<span>TEXT</span>'), <span>OTHER</span>, [
        'span: expected content "OTHER", was "TEXT"',
      ]);
    });
  });
});

function toDOM(html: string): HTMLElement {
  const doc = qwikDom.createDocument();
  const host = doc.createElement('host');
  host.innerHTML = html;
  return host.firstElementChild! as HTMLElement;
}
