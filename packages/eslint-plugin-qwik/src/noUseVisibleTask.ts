import type { Rule } from 'eslint';

export const noUseVisibleTask: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Detect useVisibleTask$() functions.',
      recommended: true,
      url: 'https://qwik.dev/docs/guides/best-practices/#use-usevisibletask-as-a-last-resort',
    },
    messages: {
      noUseVisibleTask: `useVisibleTask$() runs eagerly and blocks the main thread, preventing user interaction until the task is finished. Consider using useTask$(), useOn(), useOnDocument(), or useOnWindow() instead. If you have to use a useVisibleTask$(), you can disable the warning with a '// eslint-disable-next-line qwik/no-use-visible-task' comment.`,
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
