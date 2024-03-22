import type { TSESLint } from '@typescript-eslint/utils';
import jsxAstUtils from 'jsx-ast-utils';
import { QwikEslintExamples } from '../examples';

const reactSpecificProps = [
  { from: 'className', to: 'class' },
  { from: 'htmlFor', to: 'for' },
];

const domElementRegex = /^[a-z]/;
export const isDOMElementName = (name: string): boolean => domElementRegex.test(name);

export const noReactProps = {
  meta: {
    type: 'problem',
    docs: {
      recommended: 'warn',
      description: 'Disallow usage of React-specific `className`/`htmlFor` props.',
      url: 'https://qwik.dev/docs/advanced/eslint/#no-react-props',
    },
    fixable: 'code',
    schema: [],
    messages: {
      prefer: 'Prefer the `{{ to }}` prop over the deprecated `{{ from }}` prop.',
    },
  },
  create(context) {
    const modifyJsxSource = context.sourceCode
      .getAllComments()
      .some((c) => c.value.includes('@jsxImportSource'));
    if (modifyJsxSource) {
      return {};
    }
    return {
      JSXOpeningElement(node) {
        for (const { from, to } of reactSpecificProps) {
          const classNameAttribute = jsxAstUtils.getProp(node.attributes, from);
          if (classNameAttribute) {
            // only auto-fix if there is no class prop defined
            const fix = !jsxAstUtils.hasProp(node.attributes, to, { ignoreCase: false })
              ? (fixer: TSESLint.RuleFixer) => fixer.replaceText(classNameAttribute.name, to)
              : undefined;

            context.report({
              node: classNameAttribute,
              messageId: 'prefer',
              data: { from, to },
              fix,
            });
          }
        }
      },
    };
  },
};

const preferGood = `
<MyReactComponent class="foo" for="#password" />;`.trim();

const preferBad = `
<MyReactComponent className="foo" htmlFor="#password" />;`.trim();

export const noReactPropsExamples: QwikEslintExamples = {
  prefer: {
    good: [
      {
        codeHighlight: '/class/#a /for/#b',
        code: preferGood,
      },
    ],
    bad: [
      {
        codeHighlight: '/className/#a /htmlFor/#b',
        code: preferBad,
        description: 'Prefer `class` and `for` props over `className` and `htmlFor`.',
      },
    ],
  },
};
