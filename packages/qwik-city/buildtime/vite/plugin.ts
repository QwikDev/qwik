import { createMdxTransformer, MdxTransform } from '../markdown/mdx';
import { extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { generateQwikCityPlan } from '../runtime-generation/generate-runtime';
import type { BuildContext } from '../types';
import { createBuildContext, resetBuildContext } from '../utils/context';
import { isMarkdownFileName, normalizePath } from '../utils/fs';
import { validatePlugin } from './validate-plugin';
import type { QwikCityVitePluginOptions } from './types';
import { build } from '../build';
import ts from 'typescript';
import { configureDevServer } from './dev-server';

/**
 * @alpha
 */
export function qwikCity(userOpts?: QwikCityVitePluginOptions) {
  let ctx: BuildContext | null = null;
  let mdxTransform: MdxTransform | null = null;
  let rootDir: string | null = null;

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city',

    enforce: 'pre',

    config() {
      const updatedViteConfig: any = {
        optimizeDeps: {
          exclude: ['@builder.io/qwik-city', QWIK_CITY],
        },
        ssr: {
          noExternal: [QWIK_CITY_PLAN_ID, QWIK_CITY],
        },
      };
      return updatedViteConfig;
    },

    async configResolved(config) {
      rootDir = resolve(config.root);

      const target = config.build?.ssr || config.mode === 'ssr' ? 'ssr' : 'client';

      ctx = createBuildContext(rootDir!, userOpts, target);

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);
    },

    configureServer(server) {
      configureDevServer(ctx, server);
    },

    buildStart() {
      resetBuildContext(ctx);
    },

    resolveId(id) {
      if (id === QWIK_CITY_PLAN_ID) {
        return join(rootDir!, QWIK_CITY_PLAN_ID);
      }
      return null;
    },

    async load(id) {
      if (id.endsWith(QWIK_CITY_PLAN_ID) && ctx) {
        // @qwik-city-plan
        await build(ctx);
        ctx.diagnostics.forEach((d) => {
          this.warn(d.message);
        });
        return generateQwikCityPlan(ctx);
      }
      return null;
    },

    async transform(code, id) {
      if (isMarkdownFileName(id) && mdxTransform) {
        const mdxResult = await mdxTransform(code, id);
        return mdxResult;
      }

      if (ctx && ctx.target === 'client') {
        const ext = extname(id);
        if (ext === '.js' && !id.includes('_layout')) {
          id = normalizePath(id);
          if (id.startsWith(ctx.opts.routesDir)) {
            if (SERVER_FNS.some((fnName) => code.includes(fnName))) {
              const modifiedCode = removeServerFns(code, id);
              if (modifiedCode) {
                return modifiedCode;
              }
            }
          }
        }
      }

      return null;
    },
  };

  return plugin as any;
}

function removeServerFns(code: string, id: string) {
  let didModify = false;
  const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest);

  for (const s of sourceFile.statements) {
    if (!ts.isVariableStatement(s)) {
      continue;
    }

    if (!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }

    const decs = s.declarationList.declarations;

    for (const d of decs) {
      if (!ts.isVariableDeclaration(d)) {
        continue;
      }
      const identifier = d.name;
      if (!ts.isIdentifier(identifier)) {
        continue;
      }
      if (!SERVER_FNS.some((fn) => identifier.escapedText === fn)) {
        continue;
      }

      (d as any).initializer = ts.factory.createNull();
      didModify = true;
    }
  }

  if (didModify) {
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    return printer.printFile(sourceFile);
  }
  return null;
}

const QWIK_CITY_PLAN_ID = '@qwik-city-plan';
const QWIK_CITY = '@builder.io/qwik-city';

const SERVER_FNS = ['onGet', 'onPost', 'onRequest'];
