import { fromCamelToKebabCase } from './../core/util/case';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { render as renderIn } from '@builder.io/qwik';
import { ElementFixture, trigger, dispatch } from './element-fixture';
import { setTestPlatform } from './platform';

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
    userEvent: function (queryOrElement: string | Element, eventNameCamel: string) {
      if (typeof queryOrElement === 'string') return trigger(host, queryOrElement, eventNameCamel);
      const kebabEventName = fromCamelToKebabCase(eventNameCamel);
      const event = { type: kebabEventName };
      const attrName = 'on:' + kebabEventName;
      return dispatch(host, attrName, event);
    },
  };
};
