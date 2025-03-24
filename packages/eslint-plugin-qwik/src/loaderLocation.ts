import type { Rule } from 'eslint';
import { QwikEslintExamples } from '../examples';

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
      description: 'Detect declaration location of loader$.',
      recommended: true,
      url: 'https://qwik.dev/docs/advanced/eslint/#loader-location',
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
      invalidLoaderLocation: `'{{fnName}}() are typically declared in route boundary files such as layout.tsx, index.tsx and plugin.tsx inside the {{routesDir}} directory
(docs: https://qwik.dev/docs/route-loader/).

This {{fnName}}() is declared outside of the route boundaries. This may be useful when you want to create reusable logic or a library. In such a case, it is essential that this function is re-exported from within the router boundary otherwise it will not run.
(docs: https://qwik.dev/docs/re-exporting-loaders/).

If you understand this, you can disable this warning with:
// eslint-disable-next-line qwik/loader-location
`,
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
    const path = normalizePath(context.filename ?? context.getFilename());
    const isLayout = /\/layout(|!|-.+)\.(j|t)sx?$/.test(path);
    const isIndex = /\/index(|!|@.+)\.(j|t)sx?$/.test(path);
    const isPlugin = /\/plugin(|@.+)\.(j|t)sx?$/.test(path);
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
        if (!isExported(variableDeclarator)) {
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

const invalidLoaderLocationGood = `
import { routeLoader$ } from '@builder.io/qwik-city';
 
export const useProductDetails = routeLoader$(async (requestEvent) => {
  const res = await fetch(\`https://.../products/\${requestEvent.params.productId}\`);
  const product = await res.json();
  return product as Product;
});`.trim();

const invalidLoaderLocationBad = invalidLoaderLocationGood;

const missingExportGood = invalidLoaderLocationGood;

const missingExportBad = `
import { routeLoader$ } from '@builder.io/qwik-city';
 
const useProductDetails = routeLoader$(async (requestEvent) => {
  const res = await fetch(\`https://.../products/\${requestEvent.params.productId}\`);
  const product = await res.json();
  return product as Product;
});`.trim();

const wrongNameGood = invalidLoaderLocationGood;

const wrongNameBad = `
import { routeLoader$ } from '@builder.io/qwik-city';
 
export const getProductDetails = routeLoader$(async (requestEvent) => {
  const res = await fetch(\`https://.../products/\${requestEvent.params.productId}\`);
  const product = await res.json();
  return product as Product;
});`.trim();

const recommendedValueGood = invalidLoaderLocationGood;

const recommendedValueBad = `
import { routeLoader$ } from '@builder.io/qwik-city';
 
async function fetcher() {
  const res = await fetch(\`https://.../products/\${requestEvent.params.productId}\`);
  const product = await res.json();
  return product as Product;
}

export const useProductDetails = routeLoader$(fetcher);
`.trim();

export const loaderLocationExamples: QwikEslintExamples = {
  invalidLoaderLocation: {
    good: [
      {
        codeTitle: 'src/routes/product/[productId]/index.tsx',
        codeHighlight: '{3} /routeLoader$/#a',
        code: invalidLoaderLocationGood,
      },
    ],
    bad: [
      {
        codeTitle: 'src/components/product/product.tsx',
        codeHighlight: '{3} /routeLoader$/#a',
        code: invalidLoaderLocationBad,
        description:
          'This is not a valid location for a route loader. It only can be used inside the `src/routes` folder, in a `layout.tsx` or `index.tsx` file.',
      },
    ],
  },
  missingExport: {
    good: [
      {
        codeHighlight: '{3} /export/#a',
        code: missingExportGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{3}',
        code: missingExportBad,
        description: 'The route loader function must be exported.',
      },
    ],
  },
  wrongName: {
    good: [
      {
        codeHighlight: '{3} /use/#a',
        code: wrongNameGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{3} /get/#a',
        code: wrongNameBad,
        description: 'The route loader function name must start with `use`.',
      },
    ],
  },
  recommendedValue: {
    good: [
      {
        codeHighlight: '{3} /=>/#a',
        code: recommendedValueGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{9} /fetcher/#a',
        code: recommendedValueBad,
        description:
          'It is recommended to inline the arrow function. This will help the optimizer make sure that no server code is leaked to the client build.',
      },
    ],
  },
};
function isExported(variableDeclarator: Rule.Node): boolean {
  if (variableDeclarator.parent.parent.type === 'ExportNamedDeclaration') {
    return true;
  }
  if (variableDeclarator.type === 'VariableDeclarator') {
    const id = variableDeclarator.id;
    if ('name' in id) {
      const name = id.name;
      const body = getProgramBody(variableDeclarator);
      for (let idx = 0; idx < body.length; idx++) {
        const node = body[idx];
        if (node.type == 'ExportNamedDeclaration') {
          const specifiers = node.specifiers;
          for (let specIdx = 0; specIdx < specifiers.length; specIdx++) {
            const exportNode = specifiers[specIdx];
            if (exportNode.type == 'ExportSpecifier') {
              if (exportNode.exported.type == 'Identifier' && exportNode.exported.name === name) {
                return true;
              }
            }
          }
        }
      }
    }
  }
  return false;
}

function getProgramBody(variableDeclarator) {
  let program: Rule.Node = variableDeclarator;
  while (program.type !== 'Program') {
    program = program.parent;
  }
  const body = program.body;
  return body;
}
