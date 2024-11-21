import { ElementFixture, trigger } from './element-fixture';
import { setTestPlatform } from './platform';
import type { JSXOutput } from '@qwik.dev/core';
import { render, setPlatform } from '@qwik.dev/core';

/**
 * CreatePlatform and CreateDocument
 *
 * @public
 */
export const createDOM = async function ({ html }: { html?: string } = {}) {
  setTestPlatform(setPlatform);
  const host = new ElementFixture({ html }).host;
  return {
    render: function (jsxElement: JSXOutput) {
      return render(host, jsxElement);
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
