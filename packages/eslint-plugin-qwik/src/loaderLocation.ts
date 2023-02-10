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
        '{{fnName}}() can only be declared in `layout.tsx`, `index.tsx` and `plugin.tsx` inside the `src/routes` directory, instead it was declared in "{{path}}". Please check the docs: https://qwik.builder.io/qwikcity/loader',
      missingExport:
        'The return of {{fnName}}() needs to be exported in the same module, like this:\n `export const {{id}} = {{fnName}}(() => { ... });`',
      wrongName:
        'The named export of {{fnName}}() needs to be a `use*` function, ie, it must start with `use`, like this:\n `export const {{fixed}} = {{fnName}}(() => { ... });`\nInstead it was named `{{id}}`.',
    },
  },
  create(context) {
    const path = normalizePath(context.getFilename());
    const isLayout = /\/layout(|!|-.+)\.tsx?$/.test(path);
    const isIndex = /\/index(|!|@.+)\.tsx?$/.test(path);
    const isInsideRoutes = /\/src\/routes\//.test(path);

    const canContainLoader = isInsideRoutes && (isIndex || isLayout);
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') {
          return;
        }
        const fnName = node.callee.name;
        if (fnName !== 'loader$' && fnName !== 'action$') {
          return;
        }
        if (!canContainLoader && fnName === 'loader$') {
          context.report({
            node: node.callee,
            messageId: 'invalidLoaderLocation',
            data: {
              fnName,
              path,
            },
          });
          return;
        }
        const variableDeclarator = node.parent;
        if (variableDeclarator.type !== 'VariableDeclarator') {
          context.report({
            node: node.callee,
            messageId: 'missingExport',
            data: {
              fnName,
              id: 'useStuff',
            },
          });
          return;
        }
        if (variableDeclarator.id.type !== 'Identifier') {
          context.report({
            node: node.callee,
            messageId: 'missingExport',
            data: {
              fnName,
              id: 'useStuff',
            },
          });
          return;
        }
        if (!/^use[A-Z]/.test(variableDeclarator.id.name)) {
          const fixed =
            'use' +
            variableDeclarator.id.name[0].toUpperCase() +
            variableDeclarator.id.name.slice(1);
          context.report({
            node: variableDeclarator.id,
            messageId: 'wrongName',
            data: {
              fnName,
              id: variableDeclarator.id.name,
              fixed,
            },
          });
          return;
        }
        if (variableDeclarator.parent.parent.type !== 'ExportNamedDeclaration') {
          context.report({
            node: variableDeclarator.id,
            messageId: 'missingExport',
            data: {
              fnName,
              id: variableDeclarator.id.name,
            },
          });
          return;
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
