/* eslint-disable no-console */
import type { Rule } from 'eslint';
import type { CallExpression } from 'estree';
export const useMethodUsage: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Object destructuring is not recommended for component$',
      category: 'Variables',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
    messages: {
      'use-after-await': 'Calling use* methods after await is not safe.',
      'use-wrong-function': 'Calling use* methods in wrong function.',
      'use-not-root': 'Calling use* methods in non-root component.',
    },
  },
  create(context) {
    const modifyJsxSource = context
      .getSourceCode()
      .getAllComments()
      .some((c) => c.value.includes('@jsxImportSource'));
    if (modifyJsxSource) {
      return {};
    }
    const stack: { await: boolean }[] = [];
    return {
      ArrowFunctionExpression() {
        stack.push({ await: false });
      },
      'ArrowFunctionExpression:exit'(d) {
        stack.pop();
      },
      AwaitExpression() {
        const last = stack[stack.length - 1];
        if (last) {
          last.await = true;
        }
      },
      'CallExpression[callee.name=/^use[A-Z]/]'(node: CallExpression & Rule.NodeParentExtension) {
        const last = stack[stack.length - 1];
        if (last && last.await) {
          context.report({
            node,
            messageId: 'use-after-await',
          });
        }
        let parent = node as Rule.Node;
        while ((parent = parent.parent)) {
          const type = parent.type;
          switch (type) {
            case 'VariableDeclarator':
            case 'VariableDeclaration':
            case 'ExpressionStatement':
            case 'MemberExpression':
            case 'BinaryExpression':
            case 'UnaryExpression':
            case 'BlockStatement':
              break;
            case 'ArrowFunctionExpression':
            case 'FunctionExpression':
              if (parent.parent.type === 'VariableDeclarator') {
                if (
                  parent.parent.id?.type === 'Identifier' &&
                  parent.parent.id.name.startsWith('use')
                ) {
                  return;
                }
              }
              if (parent.parent.type === 'CallExpression') {
                if (
                  parent.parent.callee.type === 'Identifier' &&
                  parent.parent.callee.name === 'component$'
                ) {
                  return;
                }
              }
              context.report({
                node,
                messageId: 'use-wrong-function',
              });
              return;
            case 'FunctionDeclaration':
              if (!parent.id?.name.startsWith('use')) {
                context.report({
                  node,
                  messageId: 'use-wrong-function',
                });
                return;
              }
              break;
            default:
              context.report({
                node,
                messageId: 'use-not-root',
              });
              return;
            // ERROR
          }
        }
      },
    };
  },
};
