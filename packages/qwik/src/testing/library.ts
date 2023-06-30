import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { fromCamelToKebabCase } from './../core/util/case';
import { ElementFixture, dispatch } from './element-fixture';
import { getTestPlatform, setTestPlatform } from './platform';

/**
 *
 * @param root
 * @param selector
 * @param eventNameCamel
 */
async function triggerUserEvent(
  root: Element,
  selector: string,
  eventNameCamel: string,
  eventPayload: any = {}
): Promise<void> {
  for (const element of Array.from(root.querySelectorAll(selector))) {
    const kebabEventName = fromCamelToKebabCase(eventNameCamel);
    const event = { type: kebabEventName, ...eventPayload };
    const attrName = 'on:' + kebabEventName;
    await dispatch(element, attrName, event);
  }
  await getTestPlatform().flush();
}

/**
 * CreatePlatform and CreateDocument
 * @public
 */
export const createDOM = async function () {
  const qwik = await getQwik();
  setTestPlatform(qwik.setPlatform);
  const host = new ElementFixture().host;
  return {
    render: function (jsxElement: JSXNode) {
      return qwik.render(host, jsxElement);
    },
    screen: host,
    userEvent: async function (
      queryOrElement: string | Element | keyof HTMLElementTagNameMap | null,
      eventNameCamel: string | keyof WindowEventMap,
      eventPayload: any = {}
    ) {
      if (typeof queryOrElement === 'string') {
        return triggerUserEvent(host, queryOrElement, eventNameCamel, eventPayload);
      }
      const kebabEventName = fromCamelToKebabCase(eventNameCamel);
      const event = { type: kebabEventName, ...eventPayload };
      const attrName = 'on:' + kebabEventName;
      await dispatch(queryOrElement, attrName, event);
      await getTestPlatform().flush();
    },
  };
};

const getQwik = async (): Promise<typeof import('@builder.io/qwik')> => {
  if ((globalThis as any).RUNNER !== false) {
    return await import('../core/index');
  } else {
    return await import('@builder.io/qwik');
  }
};
