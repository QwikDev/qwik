import type { Rule } from 'eslint';
import { QwikEslintExamples } from '../examples';

export const unusedServer: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect unused server$() functions.',
      recommended: true,
      url: 'https://qwik.dev/docs/advanced/eslint/#unused-server',
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

const unusedServerGood = `
import { component$ } from '@builder.io/qwik';
import { server$ } from '@builder.io/qwik-city';
 
const serverGreeter = server$((firstName: string, lastName: string) => {
  const greeting = \`Hello \${firstName} \${lastName}\`;
  return greeting;
});
 
export default component$(() => (
    <button
      onClick$={async () => {
        const greeting = await serverGreeter('John', 'Doe');
        alert(greeting);
      }}
    >
      greet
    </button>
  );
);`.trim();

const unusedServerBad = `
import { component$ } from '@builder.io/qwik';
import { server$ } from '@builder.io/qwik-city';
 
const serverGreeter = server$((firstName: string, lastName: string) => {
  const greeting = \`Hello \${firstName} \${lastName}\`;
  return greeting;
});
 
export default component$(() => (
    <button
      onClick$={async () => {
        const greeting = 'not using the server$ function';
        alert(greeting);
      }}
    >
      greet
    </button>
  );
);`.trim();

export const unusedServerExamples: QwikEslintExamples = {
  unusedServer: {
    good: [
      {
        codeHighlight: '{4,12} /serverGreeter/#a',
        code: unusedServerGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{4,12} /serverGreeter/#a',
        code: unusedServerBad,
        description: 'A `server$` function is declared, but never used.',
      },
    ],
  },
};
