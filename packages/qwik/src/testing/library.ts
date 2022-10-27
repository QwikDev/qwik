import { fromCamelToKebabCase } from './../core/util/case';
import { ElementFixture, dispatch } from './element-fixture';
import { setTestPlatform, getTestPlatform } from './platform';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { render as renderIn } from '@builder.io/qwik';
import { render as renderDev } from '../core/render/dom/render.public';
/**
 *
 * @param root
 * @param selector
 * @param eventNameCamel
 */
async function triggerUserEvent(
  root: Element,
  selector: string,
  eventNameCamel: string
): Promise<void> {
  for (const element of Array.from(root.querySelectorAll(selector))) {
    const kebabEventName = fromCamelToKebabCase(eventNameCamel);
    const event = { type: kebabEventName };
    const attrName = 'on:' + kebabEventName;
    await dispatch(element, attrName, event);
  }
  await getTestPlatform().flush();
}

/**
 * CreatePlatfrom and CreateDocument
 * @alpha
 */
export const createDOM = function (opts?: { dev: boolean }) {
  setTestPlatform();
  const host = new ElementFixture().host;
  return {
    render: function (jsxElement: JSXNode) {
      return opts?.dev ? renderIn(host, jsxElement) : renderDev(host, jsxElement);
    },
    screen: host,
    userEvent: async function (queryOrElement: string | Element | null, eventNameCamel: string) {
      if (typeof queryOrElement === 'string')
        return triggerUserEvent(host, queryOrElement, eventNameCamel);
      const kebabEventName = fromCamelToKebabCase(eventNameCamel);
      const event = { type: kebabEventName };
      const attrName = 'on:' + kebabEventName;
      await dispatch(queryOrElement, attrName, event);
      await getTestPlatform().flush();
    },
  };
};
