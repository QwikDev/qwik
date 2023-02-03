/* eslint-disable no-console */
import type { Rule } from 'eslint';
import type { CallExpression } from 'estree';

export const loaderLocation: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect declaration location of loader$',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
    messages: {
      invalidLoaderLocation:
        'loader$() can only be declared in `layout.tsx`, `index.tsx` and `plugin.tsx` inside the `src/routes` directory, instead it was declared in "{{path}}". Please check the docs: https://qwik.builder.io/qwikcity/loader',
    },
  },
  create(context) {
    const path = normalizePath(context.getFilename());
    const isLayout = /\/layout(|!|-.+)\.tsx?$/.test(path);
    const isIndex = /\/index(|!|@.+)\.tsx?$/.test(path);
    const isInsideRoutes = /\/src\/routes\//.test(path);

    const canContainLoader = isInsideRoutes && (isIndex || isLayout);
    return {
      CallExpression(node: CallExpression) {
        if (
          !canContainLoader &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'loader$'
        ) {
          context.report({
            node: node.callee,
            messageId: 'invalidLoaderLocation',
            data: {
              path,
            },
          });
        }
      },
    };
  },
};

export function normalizePath(path: string) {
  // MIT https://github.com/sindresorhus/slash/blob/main/license
  // Convert Windows backslash paths to slash paths: foo\\bar ➔ foo/bar
  const isExtendedLengthPath = /^\\\\\?\\/.test(path);
  const hasNonAscii = /[^\u0000-\u0080]+/.test(path); // eslint-disable-line no-control-regex

  if (isExtendedLengthPath || hasNonAscii) {
    return path;
  }

  path = path.replace(/\\/g, '/');
  if (path.endsWith('/')) {
    path = path.slice(0, path.length - 1);
  }
  return path;
}
