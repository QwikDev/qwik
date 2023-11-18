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

When in doubt, instead of useVisibleTask$() use:
- useTask$: to perform code execution in SSR mode.
- useOn(): listen to events on the root element of the current component.
- useOnWindow(): listen to events on the window object.
- useOnDocument(): listen to events on the document object.

Sometimes it is the only way to achieve the result.
In that case, add:
// eslint-disable-next-line qwik/no-use-visible-task
to the line before "useVisibleTask$" to acknowledge you understand.
`,
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
