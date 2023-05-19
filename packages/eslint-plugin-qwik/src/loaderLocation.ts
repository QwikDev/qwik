/* eslint-disable no-console */
import type { Rule } from 'eslint';

export const ROUTE_FNS: Record<string, boolean> = {
  loader$: true,
  routeLoader$: true,
  routeAction$: true,
  routeHandler$: true,
};

export const LINTER_FNS: Record<string, boolean> = {
  ...ROUTE_FNS,
  action$: true,
  globalAction$: true,
};

export const loaderLocation: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect declaration location of loader$',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
    schema: [
      {
        type: 'object',
        properties: {
          routesDir: {
            type: 'string',
            default: 'src/routes',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      invalidLoaderLocation:
        '`{{fnName}}()` can only be declared in `layout.tsx`, `index.tsx` and `plugin.tsx` inside the {{routesDir}} directory, instead it was declared in "{{path}}".\nPlease check the docs: https://qwik.builder.io/docs/route-loader/',
      missingExport:
        'The return of `{{fnName}}()` needs to be exported in the same module, like this\n```\nexport const {{id}} = {{fnName}}(() => { ... });\n```',
      wrongName:
        'The named export of `{{fnName}}()` needs to follow the `use*` naming convention. It must start with `use`, like this:\n```\nexport const {{fixed}} = {{fnName}}(() => { ... });\n```\nInstead it was named:\n```\nexport const {{id}} = ...\n```',
      recommendedValue:
        'For `{{fnName}}()` it is recommended to inline the arrow function. Instead of:\n```\nexport const {{id}} = {{fnName}}({{arg}});\n```\nDo this:\n```\nexport const {{id}} = {{fnName}}(() => { ...logic here... });\n```\nThis will help the optimizer make sure that no server code is leaked to the client build.',
    },
  },
  create(context) {
    const routesDir = context.options?.[0]?.routesDir ?? 'src/routes';
    const path = normalizePath(context.getFilename());
    const isLayout = /\/layout(|!|-.+)\.tsx?$/.test(path);
    const isIndex = /\/index(|!|@.+)\.tsx?$/.test(path);
    const isPlugin = /\/plugin(|@.+)\.tsx?$/.test(path);
    const isInsideRoutes = new RegExp(`/${routesDir}/`).test(path);

    const canContainLoader = isInsideRoutes && (isIndex || isLayout || isPlugin);
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') {
          return;
        }
        const fnName = node.callee.name;
        if (!LINTER_FNS[fnName]) {
          return;
        }
        if (!canContainLoader && ROUTE_FNS[fnName]) {
          context.report({
            node: node.callee,
            messageId: 'invalidLoaderLocation',
            data: {
              routesDir,
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
        if (!/^use/.test(variableDeclarator.id.name)) {
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
        if (node.arguments.length > 0 && node.arguments[0].type === 'Identifier') {
          context.report({
            node: node.arguments[0],
            messageId: 'recommendedValue',
            data: {
              fnName,
              id: variableDeclarator.id.name,
              arg: node.arguments[0].name,
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
