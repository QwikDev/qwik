import { fromCamelToKebabCase } from './../core/util/case';
import { ElementFixture, dispatch } from './element-fixture';
import { setTestPlatform, getTestPlatform } from './platform';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { render as renderIn } from '@builder.io/qwik';

const RUNNER = (process?.argv || []).includes('--tsmconfig');
/**
 * Check runner. Because pipeline dosen't pass for set test platform
 */
const callSetPlatform = async () => {
  if (RUNNER) {
    const corePlatform = await import('../core/platform/platform');
    return setTestPlatform(corePlatform.setPlatform);
  }
  setTestPlatform();
};

/**
 * Check runner. For use right render
 * @param host
 * @param jsxElement
 * @returns
 */
const renderPlatform = async (host: Element | Document, jsxElement: JSXNode) => {
  if (RUNNER) {
    const coreRender = await import('../core/render/dom/render.public');
    return coreRender.render(host, jsxElement);
  }
  return renderIn(host, jsxElement);
};

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
export const createDOM = function () {
  callSetPlatform();
  const host = new ElementFixture().host;
  return {
    render: function (jsxElement: JSXNode) {
      return renderPlatform(host, jsxElement);
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
