import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import { QwikEslintExamples } from '../examples';

const createRule = ESLintUtils.RuleCreator(() => 'https://qwik.builder.io/docs/advanced/dollar/');

export const jsxImg = createRule({
  defaultOptions: [],
  name: 'jsx-img',
  meta: {
    type: 'problem',
    docs: {
      description:
        'For performance reasons, always provide width and height attributes for <img> elements, it will help to prevent layout shifts.',
      recommended: 'warn',
      url: 'https://qwik.builder.io/docs/advanced/eslint/#jsx-img',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noWidthHeight:
        'For performance reasons, always provide width and height attributes for <img> elements, it will help to prevent layout shifts.',
    },
  },
  create(context) {
    return {
      JSXElement(node: TSESTree.JSXElement) {
        if (
          node.openingElement.name.type === 'JSXIdentifier' &&
          node.openingElement.name.name === 'img'
        ) {
          const hasSpread = node.openingElement.attributes.some(
            (attr) => attr.type === 'JSXSpreadAttribute'
          );

          if (!hasSpread) {
            const hasWidth = node.openingElement.attributes.some(
              (attr) =>
                attr.type === 'JSXAttribute' &&
                attr.name.type === 'JSXIdentifier' &&
                attr.name.name === 'width'
            );
            const hasHeight = node.openingElement.attributes.some(
              (attr) =>
                attr.type === 'JSXAttribute' &&
                attr.name.type === 'JSXIdentifier' &&
                attr.name.name === 'height'
            );
            if (!hasWidth || !hasHeight) {
              context.report({
                node: node as any,
                messageId: 'noWidthHeight',
              });
            }
          }
        }
      },
    };
  },
});

const noWidthHeightGood = `
<img width="200" height="600" src="/static/images/portrait-01.webp">`.trim();

const noWidthHeightBad = `
<img src="/static/images/portrait-01.webp">`.trim();

export const jsxImgExamples: QwikEslintExamples = {
  noWidthHeight: {
    good: [
      {
        codeHighlight: '/width/#a /height/#b',
        code: noWidthHeightGood,
      },
    ],
    bad: [
      {
        code: noWidthHeightBad,
        description:
          'For performance reasons, always provide width and height attributes for `<img>` elements, it will help to prevent layout shifts.',
      },
    ],
  },
};
