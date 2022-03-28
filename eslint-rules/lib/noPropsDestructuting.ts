/* eslint-disable no-console */
/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { Rule } from 'eslint';

export const noPropsDestructuring: Rule.RuleModule = {
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
    return {
      "CallExpression[callee.name='component$'][arguments.0.params.0.type='ObjectPattern']"(
        node: any
      ) {
        context.report({
          node: node.arguments[0].params[0],
          message: 'Props destructuring is not a good practice in Qwik',
        });
      },
    };
  },
};
