/* eslint-disable no-console */
import type { Rule } from 'eslint';
import type { JSXElement } from 'estree-jsx';
import { exit } from 'process';

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
        'Multiple JSX root are not allowed inside the same component, instead use a single Fragment node (<>{}</>) and place all the template inside.',
      lastJsxRoot:
        'There must be a single JSX node as root, make sure all JSX nodes are wrapped around a unique Fragment.',
    },
  },
  create(context) {
    const stack: {
      rootNodes: JSXElement[];
      depth: number;
    }[] = [];
    return {
      ArrowFunctionExpression(node) {
        stack.push({
          rootNodes: [],
          depth: 0,
        });
      },
      'ArrowFunctionExpression:exit'() {
        const current = stack[stack.length - 1];
        if (current) {
          if (current.rootNodes.length > 1) {
            context.report({
              node: current.rootNodes[current.rootNodes.length - 1].openingElement,
              messageId: 'lastJsxRoot',
            });
          }
        }
        stack.pop();
      },
      FunctionDeclaration(node) {
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
            if (current.rootNodes.length > 1) {
              context.report({
                node: current.rootNodes[current.rootNodes.length - 2],
                messageId: 'multipleJsxRoots',
              });
            }
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
