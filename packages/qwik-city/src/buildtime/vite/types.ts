import type { CompileOptions } from '@mdx-js/mdx';
import type { MdxTransform } from '../markdown/mdx';
import type { BuildContext, BuildEntry, BuildRoute, PluginOptions, MdxPlugins } from '../types';
import type { Config as SVGOConfig } from 'svgo';
import type { BuiltinsWithOptionalParams as SVGOBuiltinPluginsWithOptionalParams } from 'svgo/plugins/plugins-types';
import type { Plugin as VitePlugin } from 'vite';

/** @public */
export interface ImageOptimizationOptions {
  jsxDirectives?: {
    quality?: `${number}`;
    format?: 'webp' | 'avif' | 'png';
    w?: string;
    h?: string;
    [key: string]: string | undefined;
  };
  svgo?: Pick<SVGOConfig, 'floatPrecision' | 'multipass' | 'plugins'> & {
    defaultPresetOverrides?: SVGOBuiltinPluginsWithOptionalParams['preset-default']['overrides'];
    prefixIds?: SVGOBuiltinPluginsWithOptionalParams['prefixIds'] | false;
  };
  enabled?: boolean | 'only-production';
}

/** @public */
export interface QwikCityVitePluginOptions extends Omit<PluginOptions, 'basePathname'> {
  mdxPlugins?: MdxPlugins;
  mdx?: MdxOptions;
  platform?: Record<string, unknown>;
  imageOptimization?: ImageOptimizationOptions;
}

/** @public */

export type MdxOptions = CompileOptions;

export interface PluginContext {
  buildCtx: BuildContext | null;
  rootDir: string;
  cityPlanCode: string | null;
  mdxTransform: MdxTransform | null;
}

type P<T> = VitePlugin<T> & { api: T };

/** @public */
export interface QwikCityPlugin extends P<QwikCityPluginApi> {
  name: 'vite-plugin-qwik-city';
}

/** @public */
export interface QwikCityPluginApi {
  getBasePathname: () => string;
  getRoutes: () => BuildRoute[];
  getServiceWorkers: () => BuildEntry[];
}
