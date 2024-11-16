'use strict';
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const fs = require('fs');
const promises = require('fs/promises');
const node_path = require('node:path');
const promises$1 = require('node:fs/promises');
const standalone = require('prettier/standalone');
const logWarn = (message) => {
  console.warn('\x1B[33m%s\x1B[0m', `qwikInsight()[WARN]: ${message}`);
};
const log = (message) => {
  console.log('\x1B[35m%s\x1B[0m', `qwikInsight(): ${message}`);
};
async function qwikInsights(qwikInsightsOpts) {
  const {
    publicApiKey,
    baseUrl = 'https://qwik-insights.builder.io',
    outDir = 'dist',
  } = qwikInsightsOpts;
  let isProd = false;
  const vitePlugin = {
    name: 'vite-plugin-qwik-insights',
    enforce: 'pre',
    apply: 'build',
    async config(viteConfig) {
      isProd = viteConfig.mode !== 'ssr';
      if (isProd) {
        const qManifest = { type: 'smart' };
        try {
          const response = await fetch(`${baseUrl}/api/v1/${publicApiKey}/bundles/strategy/`);
          const strategy = await response.json();
          Object.assign(qManifest, strategy);
        } catch (e) {
          logWarn('fail to fetch manifest from Insights DB');
        }
        const cwdRelativePath = node_path.join(viteConfig.root || '.', outDir);
        const cwdRelativePathJson = node_path.join(cwdRelativePath, 'q-insights.json');
        if (!fs.existsSync(node_path.join(process.cwd(), cwdRelativePath))) {
          fs.mkdirSync(node_path.join(process.cwd(), cwdRelativePath), { recursive: true });
        }
        log('Fetched latest Qwik Insight data into: ' + cwdRelativePathJson);
        await promises.writeFile(
          node_path.join(process.cwd(), cwdRelativePathJson),
          JSON.stringify(qManifest)
        );
      }
    },
    closeBundle: async () => {
      const path = node_path.join(process.cwd(), outDir, 'q-manifest.json');
      if (isProd && fs.existsSync(path)) {
        const qManifest = await promises.readFile(path, 'utf-8');
        try {
          await fetch(`${baseUrl}/api/v1/${publicApiKey}/post/manifest`, {
            method: 'post',
            body: qManifest,
          });
        } catch (e) {
          logWarn('fail to post manifest to Insights DB');
        }
      }
    },
  };
  return vitePlugin;
}
async function prettify(template, ...substitutions) {
  let source = '';
  for (let i = 0; i < template.length; i++) {
    source += template[i] + (i < substitutions.length ? String(substitutions[i]) : '');
  }
  try {
    source = await standalone.format(source, {
      parser: 'typescript',
      plugins: [
        // To support running in browsers
        require('prettier/plugins/estree'),
        require('prettier/parser-typescript'),
        require('prettier/parser-postcss'),
        require('prettier/parser-html'),
        require('prettier/parser-babel'),
      ],
      htmlWhitespaceSensitivity: 'ignore',
    });
  } catch (e) {
    throw new Error(
      e +
        '\n========================================================================\n' +
        source +
        '\n\n========================================================================'
    );
  }
  return source;
}
async function generateRouteTypes(srcDir, routesDir, routes) {
  await generateSrcRoutesConfig(srcDir);
  await generateSrcRoutesGen(srcDir, routes);
}
async function generateSrcRoutesConfig(srcDir) {
  const CONFIG_FILE = await prettify`
/**
 * This file is created as part of the typed routes, but it is intended to be modified by the developer.
 *
 * @fileoverview
 */
import { untypedAppUrl, omitProps } from '@builder.io/qwik-labs';
import { type AppLinkProps, type AppRouteParamsFunction } from './routes.gen';
import { type QwikIntrinsicElements } from '@builder.io/qwik';

/**
 * Configure \`appUrl\` with the typed information of routes.
 */
export const appUrl = untypedAppUrl as AppRouteParamsFunction;

/**
 * Configure \`<AppLink/>\` component with the typed information of routes.
 *
 * NOTE: you may consider changing \`<a>\` to \`<Link>\` to be globally applied across your application.
 */
export function AppLink(props: AppLinkProps & QwikIntrinsicElements['a']) {
  return (
    <a
      href={(appUrl as (route: string, props: any, prefix: string) => string)(
        props.route,
        props,
        'param:'
      )}
      {...omitProps(props, ['href'])}
    >
      {props.children}
    </a>
  );
}
`;
  const file = node_path.join(srcDir, 'routes.config.tsx');
  const fileExists = await exists(file);
  console.log('File exists', file, fileExists);
  if (!fileExists) {
    promises$1.writeFile(file, CONFIG_FILE);
  }
}
async function exists(file) {
  try {
    return (await promises$1.stat(file)).isFile();
  } catch (e) {
    return false;
  }
}
async function generateSrcRoutesGen(srcDir, routes) {
  await promises$1.writeFile(
    node_path.join(srcDir, 'routes.gen.d.ts'),
    await prettify`
${GENERATED_HEADER}

export type AppRoutes = ${routes.map((r) => s(r)).join('|')};

export interface AppRouteMap {
  ${routes.map((r) => s(r) + ':' + toInterface('', r))}
};

export interface AppRouteParamsFunction {
  ${routes.map((r) => `(route: ${s(r)}, ${toInterface('params', r)}): string`).join(';')}
}

export type AppLinkProps = ${routes
      .map(
        (route) =>
          `{ route: ${s(route)}, ${toParams(route)
            .map((param) => s('param:' + param) + ': string')
            .join(';')}}`
      )
      .join('|')}
`
  );
}
function toParams(route) {
  const params = [];
  const parts = route.split('/');
  parts.forEach((part) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      params.push(part.substring(part.startsWith('[...') ? 4 : 1, part.length - 1));
    }
  });
  return params;
}
function toInterface(paramName, route) {
  const params = toParams(route);
  return (
    (paramName ? paramName + (params.length ? ':' : '?:') : '') +
    '{' +
    params.map((param) => param + ': string').join(';') +
    '}'
  );
}
const GENERATED_HEADER = `
///////////////////////////////////////////////////////////////////////////
/// GENERATED FILE --- DO NOT EDIT --- YOUR CHANGES WILL BE OVERWRITTEN ///
///////////////////////////////////////////////////////////////////////////
`;
function s(text) {
  return JSON.stringify(text);
}
function qwikTypes() {
  const srcFolder = node_path.join(process.cwd(), 'src');
  const routesFolder = node_path.join(srcFolder, 'routes');
  return {
    name: 'Qwik Type Generator',
    async buildStart() {
      await regenerateRoutes(srcFolder, routesFolder);
    },
  };
}
async function regenerateRoutes(srcDir, routesDir) {
  assertDirectoryExists(srcDir);
  assertDirectoryExists(routesDir);
  const routes = [];
  await collectRoutes(routesDir, routesDir, routes);
  routes.sort();
  generateRouteTypes(srcDir, routesDir, routes);
  const seenRoutes = /* @__PURE__ */ new Set();
  routes.forEach((route) => seenRoutes.add(node_path.join(routesDir, route, `index.tsx`)));
  return seenRoutes;
}
async function assertDirectoryExists(directoryPath) {
  try {
    const stats = await promises$1.stat(directoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`${directoryPath} is not a directory.`);
    }
  } catch (error) {
    throw new Error(`Directory ${directoryPath} does not exist.`);
  }
}
function getRouteDirectory(id) {
  const lastSlash = id.lastIndexOf(node_path.sep);
  const filename = id.substring(lastSlash + 1);
  if (
    filename.endsWith('index.md') ||
    filename.endsWith('index.mdx') ||
    filename.endsWith('index.js') ||
    filename.endsWith('index.jsx') ||
    filename.endsWith('index.ts') ||
    filename.endsWith('index.tsx')
  ) {
    return id.substring(0, lastSlash + 1);
  }
  return null;
}
async function collectRoutes(base, directoryPath, routes) {
  const files = await promises$1.readdir(directoryPath);
  for (let i = 0; i < files.length; i++) {
    const filePath = node_path.join(directoryPath, files[i]);
    const fileStat = await promises$1.stat(filePath);
    let route;
    if (fileStat.isDirectory()) {
      await collectRoutes(base, filePath, routes);
    } else if ((route = getRouteDirectory(filePath)) !== null) {
      routes.push(route.substring(base.length).replaceAll(node_path.sep, '/'));
    }
  }
}
exports.qwikInsights = qwikInsights;
exports.qwikTypes = qwikTypes;
