import { Rule } from 'eslint';
import { USE_FUNCTION_OUTSIDE_ROOT } from './errors';
import { isUseFunction } from './utils';

const BRANCH_PARENTS: Rule.Node['type'][] = [
  'IfStatement',
  'SwitchStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ConditionalExpression',
];

export const noUseFunctionInsideBranch: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Use functions can only be called from the root level of a callback.',
      category: 'Hooks',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
  },
  create: (context) => {
    return {
      CallExpression: (node) => {
        if (node.callee.type === 'Identifier' && isUseFunction(node.callee.name)) {
          let parent = node.parent;
          while (parent) {
            const type = parent.type;
            if (BRANCH_PARENTS.includes(type)) {
              context.report({
                node,
                message: USE_FUNCTION_OUTSIDE_ROOT,
              });
              break;
            }
            if (parent.type === 'Identifier' && isUseFunction(parent.name)) {
              console.log('check identifier');
              break;
            }
            parent = parent.parent;
          }
        }
      },
    };
  },
};
