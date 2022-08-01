import { Rule } from 'eslint';
import { isUseFunction } from './utils';

const useFunctions: string[] = [
  // Qwik
  'useResource$',
  'useClientMount$',
  'useServerMount$',
  'useClientEffect$',
];

const VALID_SCOPE = 1;
const INVALID_SCOPE = 0;

export const noUseFunctionOutsideComponent: Rule.RuleModule = {
  meta: {
    type: 'problem',
  },
  create: (context) => {
    const stack: (0 | 1)[] = [];
    return {
      CallExpression: (node) => {
        if (node.callee.type === 'Identifier') {
          const callee = node.callee.name;
          if (callee === 'component$') {
            stack.push(VALID_SCOPE);
            if (isUseFunction(callee)) {
              const scope = stack[stack.length - 1];
              if (!scope) {
                context.report({
                  node,
                  message:
                    'use*$ functions can only be called from inside of a component$/use*$ callback.',
                });
              }
              stack.push(VALID_SCOPE);
            } else {
              stack.push(INVALID_SCOPE);
            }
          }
        }
      },
      'CallExpression:exit': () => {
        stack.pop();
      },
    };
  },
};
