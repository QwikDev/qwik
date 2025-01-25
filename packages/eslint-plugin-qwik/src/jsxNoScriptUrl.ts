import { ASTUtils } from '@typescript-eslint/utils';
import { QwikEslintExamples } from '../examples';
const { getStaticValue } = ASTUtils;

// A javascript: URL can contain leading C0 control or \u0020 SPACE,
// and any newline or tab are filtered out as if they're not part of the URL.
// https://url.spec.whatwg.org/#url-parsing
// Tab or newline are defined as \r\n\t:
// https://infra.spec.whatwg.org/#ascii-tab-or-newline
// A C0 control is a code point in the range \u0000 NULL to \u001F
// INFORMATION SEPARATOR ONE, inclusive:
// https://infra.spec.whatwg.org/#c0-control-or-space
const isJavaScriptProtocol =
  /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i; // eslint-disable-line no-control-regex

/**
 * This rule is adapted from eslint-plugin-react's jsx-no-script-url rule under the MIT license.
 * Thank you for your work!
 */
export const jsxNoScriptUrl = {
  meta: {
    type: 'problem',
    docs: {
      recommended: 'error',
      description: 'Disallow javascript: URLs.',
      url: 'https://qwik.dev/docs/advanced/eslint/#jsx-no-script-url',
    },
    schema: [],
    messages: {
      noJSURL: "For security, don't use javascript: URLs. Use event handlers instead if you can.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier' && node.value) {
          const link = getStaticValue(
            node.value.type === 'JSXExpressionContainer' ? node.value.expression : node.value,
            sourceCode.getScope ? sourceCode.getScope(node) : context.getScope()
          );
          if (link && typeof link.value === 'string' && isJavaScriptProtocol.test(link.value)) {
            context.report({
              node: node.value,
              messageId: 'noJSURL',
            });
          }
        }
      },
    };
  },
};

const noJSURLGood = `
<button onClick$={() => alert('open the door please')>ring</button>`.trim();

const noJSURLBad = `
<button onClick$="javascript:alert('open the door please')">ring</button>`.trim();

export const jsxNoScriptUrlExamples: QwikEslintExamples = {
  noJSURL: {
    good: [
      {
        code: noJSURLGood,
      },
    ],
    bad: [
      {
        codeHighlight: '/javascript:/#a',
        code: noJSURLBad,
      },
    ],
  },
};
