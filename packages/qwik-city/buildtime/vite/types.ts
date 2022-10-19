import type { MdxTransform } from '../markdown/mdx';
import type { BuildContext, BuildEntry, BuildRoute, PluginOptions, MdxPlugins } from '../types';

/**
 * @alpha
 */
export interface QwikCityVitePluginOptions extends PluginOptions {
  mdxPlugins?: MdxPlugins;
  mdx?: MdxOptions;
}

/**
 * @alpha
 */
export type MdxOptions = import('@mdx-js/mdx/lib/compile').CompileOptions;

export interface PluginContext {
  buildCtx: BuildContext | null;
  rootDir: string;
  cityPlanCode: string | null;
  mdxTransform: MdxTransform | null;
}

/**
 * @alpha
 */
export interface QwikCityPlugin {
  name: 'vite-plugin-qwik-city';
  api: QwikCityPluginApi;
}

/**
 * @alpha
 */
export interface QwikCityPluginApi {
  getRoutes: () => BuildRoute[];
  getServiceWorkers: () => BuildEntry[];
}
