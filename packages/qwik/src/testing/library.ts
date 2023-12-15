import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { ElementFixture, trigger } from './element-fixture';
import { setTestPlatform } from './platform';

/**
 * CreatePlatform and CreateDocument
 *
 * @public
 */
export const createDOM = async function ({ html }: { html?: string } = {}) {
  const qwik = await getQwik();
  setTestPlatform(qwik.setPlatform);
  const host = new ElementFixture({ html }).host;
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
      return trigger(host, queryOrElement, eventNameCamel, eventPayload);
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
