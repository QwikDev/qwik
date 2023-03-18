/* eslint-disable no-console */
import type { Rule } from 'eslint';

export const unusedServer: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect unused server$() functions',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
    messages: {
      unusedServer:
        'Unused server$(). Seems like you are declaring a new server$ function, but you are never calling it. You might want to do:\n\n{{ suggestion }}',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') {
          return;
        }
        const fnName = node.callee.name;
        if (fnName === 'server$') {
          let unused = false;
          if (node.parent.type === 'ExpressionStatement') {
            unused = true;
          } else if (node.parent.type === 'AwaitExpression') {
            if (node.parent.parent.type === 'ExpressionStatement') {
              unused = true;
            }
          }
          if (unused) {
            const suggestion = `const serverFn = server$(...);\nawait serverFn(...);`;
            context.report({
              node: node.callee,
              messageId: 'unusedServer',
              data: { suggestion },
            });
          }
        }
      },
    };
  },
};
