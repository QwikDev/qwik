import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import { hasJsxAttribute } from './utils';

const createRule = ESLintUtils.RuleCreator(() => 'https://qwik.dev/docs/advanced/dollar/');

export const jsxAtag = createRule({
  defaultOptions: [],
  name: 'jsx-a-tag',
  meta: {
    type: 'problem',
    docs: {
      description: 'For a perfect SEO score, always provide href attribute for <a> elements.',
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
            const hasHref = hasJsxAttribute(node.openingElement.attributes, 'href');
            if (!hasHref) {
              context.report({
                node,
                messageId: 'noHref',
              });
            }
          }
        }
      },
    };
  },
});
