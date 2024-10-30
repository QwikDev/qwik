import { expect } from 'vitest';
import { _diffJsxVNode } from '@qwik.dev/core';

import type { _VNode } from '../core/internal';
import type { JSXNode, JSXOutput } from '../core/shared/jsx/types/jsx-node';

expect.extend({
  toMatchVDOM(this: { isNot: boolean }, received: _VNode, expected: JSXNode) {
    const { isNot } = this;
    const diffs = diffJsxVNode(received, expected);
    return {
      pass: isNot ? diffs.length !== 0 : diffs.length === 0,
      message: () => diffs.join('\n'),
    };
  },

  async toMatchDOM(this: { isNot: boolean }, received: HTMLElement, expected: JSXOutput) {
    const { isNot } = this;
    if (!received) {
      return {
        pass: false,
        message: () => 'Missing element',
      };
    }
    const diffs = await diffNode(received, expected);
    return {
      pass: isNot ? diffs.length !== 0 : diffs.length === 0,
      message: () => diffs.join('\n'),
    };
  },
});
