import type { MdxTransform } from '../markdown/mdx';
import type { BuildContext, BuildEntry, BuildRoute, PluginOptions, MdxPlugins } from '../types';
import type { Config as SVGOConfig } from 'svgo';
import type { BuiltinsWithOptionalParams as SVGOBuiltinPluginsWithOptionalParams } from 'svgo/plugins/plugins-types';

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
export type MdxOptions = import('@mdx-js/mdx').CompileOptions;

export interface PluginContext {
  buildCtx: BuildContext | null;
  rootDir: string;
  cityPlanCode: string | null;
  mdxTransform: MdxTransform | null;
}

/** @public */
export interface QwikCityPlugin {
  name: 'vite-plugin-qwik-city';
  api: QwikCityPluginApi;
}

/** @public */
export interface QwikCityPluginApi {
  getBasePathname: () => string;
  getRoutes: () => BuildRoute[];
  getServiceWorkers: () => BuildEntry[];
}
