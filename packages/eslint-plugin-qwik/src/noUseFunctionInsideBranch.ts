import { Rule } from 'eslint';
import { isUseFunction } from './utils';

const BRANCH_PARENTS: Rule.Node['type'][] = [
  'IfStatement',
  'SwitchStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'WhileStatement',
  'DoWhileStatement',
];

export const noUseFunctionInsideBranch: Rule.RuleModule = {
  meta: {
    type: 'problem',
  },
  create: (context) => {
    return {
      CallExpression: (node) => {
        if (node.callee.type === 'Identifier' && isUseFunction(node.callee.name)) {
          const parent = node.parent;
          while (parent) {
            const type = parent.type;
            if (BRANCH_PARENTS.includes(type)) {
              context.report({
                node,
                message: 'A use$ function may only appear in the root level of a function body',
              });
            }
          }
        }
      },
    };
  },
};
