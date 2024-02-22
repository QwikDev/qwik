import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prettify } from './prettify';

export async function generateRouteTypes(srcDir: string, routesDir: string, routes: string[]) {
  // console.log(routes);
  await generateSrcRoutesConfig(srcDir);
  await generateSrcRoutesGen(srcDir, routes);
}

async function generateSrcRoutesConfig(srcDir: string) {
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

  const file = join(srcDir, 'routes.config.tsx');
  const fileExists = await exists(file);
  console.log('File exists', file, fileExists);
  if (!fileExists) {
    writeFile(file, CONFIG_FILE);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch (e) {
    return false;
  }
}

async function generateSrcRoutesGen(srcDir: string, routes: string[]) {
  await writeFile(
    join(srcDir, 'routes.gen.d.ts'),
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

function toParams(route: string) {
  const params: string[] = [];
  const parts = route.split('/');
  parts.forEach((part) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      params.push(part.substring(part.startsWith('[...') ? 4 : 1, part.length - 1));
    }
  });
  return params;
}

function toInterface(paramName: string, route: string): string {
  const params: string[] = toParams(route);
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

function s(text: string): string {
  return JSON.stringify(text);
}
