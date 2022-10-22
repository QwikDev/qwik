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
 * convenience: events...
 * userEvent.click(#element)
 */
const userEvent = {
  raw: function (element: Element, eventName: string, document: Element) {
    const classListValue = parseClassWithElement(element);
    return trigger(document, `${element.tagName}${classListValue}`, eventName);
  },
};

/**
 * CreatePlatfrom and CreateDocument
 */
const createPlatform = function () {
  setTestPlatform();
  const host = new ElementFixture().host;
  return {
    host,
    render: function (jsxElement: JSXNode) {
      return renderIn(host, jsxElement);
    },
    screen: function () {
      return host;
    },
    userEvent: function (element: HTMLElement | Element, event: string) {
      const classListValue = parseClassWithElement(element);
      return trigger(host, `${element.tagName}${classListValue}`, event);
    },
  };
};

/**
 *
 * @alpha
 */
export const CreateMock = {
  userEvent,
  createPlatform,
};
