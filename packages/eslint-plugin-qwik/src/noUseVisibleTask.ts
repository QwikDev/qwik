import type { Rule } from 'eslint';

export const noUseVisibleTask: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Detect useVisibleTask$() functions.',
      recommended: true,
      url: 'https://qwik.builder.io/docs/guides/best-practices/#use-usevisibletask-as-a-last-resort',
    },
    messages: {
      noUseVisibleTask:
        'useVisibleTask$ runs eagerly and blocks the main thread. It should be used as a last resort.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') {
          return;
        }
        const fnName = node.callee.name;
        if (fnName === 'useVisibleTask$') {
          context.report({
            node: node.callee,
            messageId: 'noUseVisibleTask',
          });
        }
      },
    };
  },
};
