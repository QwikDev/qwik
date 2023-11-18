import type { Rule } from 'eslint';

export const noUseVisibleTask: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Detect useVisibleTask$() functions.',
      recommended: true,
      url: 'https://qwik.builder.io/docs/guides/best-practices/#avoid-registering-dom-events-in-usevisibletask',
    },
    messages: {
      noUseVisibleTask: `Qwik tries very hard to defer client code execution for as long as possible.
This is done to give the end-user the best possible user experience.
Running code eagerly blocks the main thread, which prevents the user from interacting until the task is finished.
"useVisibleTask$" is provided as an escape hatch.
Sometimes it is the only way to achieve the result.
In that case, add:
// eslint-disable-next-line qwik/no-use-visible-task
To the line before "useVisibleTask$" to acknowledge you understand.`,
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
