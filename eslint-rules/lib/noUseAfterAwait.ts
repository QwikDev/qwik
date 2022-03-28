/* eslint-disable no-console */
/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { Rule } from 'eslint';

export const noUseAfterAwait: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Object destructuring is not recomended for component$',
      category: 'Variables',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
  },
  create(context) {
    const stack: { await: boolean }[] = [];
    return {
      ArrowFunctionExpression() {
        stack.push({ await: false });
      },
      'ArrowFunctionExpression:exit'() {
        stack.pop();
      },
      AwaitExpression() {
        const last = stack[stack.length - 1];
        if (last) {
          last.await = true;
        }
      },
      'CallExpression[callee.name=/^use/]'(node: any) {
        const last = stack[stack.length - 1];
        if (last && last.await) {
          context.report({
            node,
            message: 'Calling use* methods after await is not safe.',
          });
        }
      },
    };
  },
};
