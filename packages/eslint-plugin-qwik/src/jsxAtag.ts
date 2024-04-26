import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(() => 'https://qwik.dev/docs/advanced/dollar/');

export const jsxAtag = createRule({
  defaultOptions: [],
  name: 'jsx-a-tag',
  meta: {
    type: 'problem',
    docs: {
      description: 'For a perfect SEO score, always provide href attribute for <a> elements.',
      recommended: 'warn',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noHref: 'For a perfect SEO score, always provide href attribute for <a> elements.',
    },
  },
  create(context) {
    return {
      JSXElement(node: TSESTree.JSXElement) {
        if (
          node.openingElement.name.type === 'JSXIdentifier' &&
          node.openingElement.name.name === 'a'
        ) {
          const hasSpread = node.openingElement.attributes.some(
            (attr) => attr.type === 'JSXSpreadAttribute'
          );

          if (!hasSpread) {
            const hasHref = node.openingElement.attributes.some(
              (attr) =>
                attr.type === 'JSXAttribute' &&
                attr.name.type === 'JSXIdentifier' &&
                attr.name.name === 'href'
            );
            if (!hasHref) {
              context.report({
                node: node as any,
                messageId: 'noHref',
              });
            }
          }
        }
      },
    };
  },
});
