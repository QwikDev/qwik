/* eslint-disable no-console */
import type { Rule } from 'eslint';
import type { JSXElement, JSXFragment } from 'estree-jsx';

export const singleJsxRoot: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect multiple JSX roots inside a component',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
    messages: {
      multipleJsxRoots:
        'Components in Qwik must have a single JSX root element. Your component has multiple roots on lines: {{lines}}. Rewrite your component with a single root such as (`return <>{...}</>`.) and keep all JSX within',
    },
  },
  create(context) {
    const stack: {
      rootNodes: (JSXElement | JSXFragment)[];
      depth: number;
    }[] = [];
    return {
      ArrowFunctionExpression() {
        stack.push({
          rootNodes: [],
          depth: 0,
        });
      },
      'ArrowFunctionExpression:exit'() {
        const current = stack[stack.length - 1];
        if (current) {
          if (current.rootNodes.length > 1) {
            const lines = current.rootNodes.map((node) => node.loc?.start.line ?? 0).join(', ');
            context.report({
              node: current.rootNodes[0],
              messageId: 'multipleJsxRoots',
              data: {
                lines,
              },
            });
          }
        }
        stack.pop();
      },
      FunctionDeclaration() {
        stack.push({
          rootNodes: [],
          depth: 0,
        });
      },
      'FunctionDeclaration:exit'() {
        stack.pop();
      },
      'JSXElement,JSXFragment'(node) {
        const current = stack[stack.length - 1];
        if (current) {
          if (current.depth === 0) {
            current.rootNodes.push(node);
          }
          current.depth++;
        }
      },
      'JSXElement:exit'() {
        const current = stack[stack.length - 1];
        if (current) {
          current.depth--;
        }
      },
    };
  },
};
