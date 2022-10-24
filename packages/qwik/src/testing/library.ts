import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { render as renderIn } from '@builder.io/qwik';
import { ElementFixture, trigger } from './element-fixture';
import { setTestPlatform } from './platform';

/**
 * @private
 * @param element
 * @returns
 */
const parseClassWithElement = (element: Element) => {
  if (!element.classList.value.length) return [];
  return element.classList.value
    .split(' ')
    .map((c) => `.${c}`)
    .join('');
};

/**
 * CreatePlatfrom and CreateDocument
 * @alpha
 */
export const createDOM = function () {
  setTestPlatform();
  const host = new ElementFixture().host;
  return {
    render: function (jsxElement: JSXNode) {
      return renderIn(host, jsxElement);
    },
    screen: host,
    userEvent: function (element: HTMLElement | string | Element, event: string) {
      if (typeof element === 'string') return trigger(host, element, event);
      const classListValue = parseClassWithElement(element);
      return trigger(host, `${element.tagName}${classListValue}`, event);
    },
  };
};
