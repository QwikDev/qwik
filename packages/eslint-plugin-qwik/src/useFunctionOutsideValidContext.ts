import { Rule } from 'eslint';
import { USE_FUNCTION_OUTSIDE_VALID_SCOPE } from './errors';
import { isUseFunction } from './utils';

const VALID_SCOPE = 1;
const INVALID_SCOPE = 0;

export const noUseFunctionOutsideComponent: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Use functions can only be called inside of a component.',
      category: 'Hooks',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
  },
  create: (context) => {
    const stack: (0 | 1)[] = [];
    return {
      CallExpression: (node) => {
        if (node.callee.type === 'Identifier') {
          const callee = node.callee.name;
          if (callee === 'component$') {
            stack.push(VALID_SCOPE);
            return;
          }
          if (isUseFunction(callee)) {
            const scope = stack[stack.length - 1];
            if (!scope) {
              context.report({
                node,
                message: USE_FUNCTION_OUTSIDE_VALID_SCOPE,
              });
            }
            stack.push(VALID_SCOPE);
            return;
          }
          stack.push(INVALID_SCOPE);
        }
      },
      'CallExpression:exit': () => {
        stack.pop();
      },
    };
  },
};
