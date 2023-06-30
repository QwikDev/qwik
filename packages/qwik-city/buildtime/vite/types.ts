import type { MdxTransform } from '../markdown/mdx';
import type { BuildContext, BuildEntry, BuildRoute, PluginOptions, MdxPlugins } from '../types';

/**
 * @public
 */
export interface QwikCityVitePluginOptions extends Omit<PluginOptions, 'basePathname'> {
  mdxPlugins?: MdxPlugins;
  mdx?: MdxOptions;
  platform?: Record<string, unknown>;
}

/**
 * @public
 */
export type MdxOptions = import('@mdx-js/mdx/lib/compile').CompileOptions;

export interface PluginContext {
  buildCtx: BuildContext | null;
  rootDir: string;
  cityPlanCode: string | null;
  mdxTransform: MdxTransform | null;
}

/**
 * @public
 */
export interface QwikCityPlugin {
  name: 'vite-plugin-qwik-city';
  api: QwikCityPluginApi;
}

/**
 * @public
 */
export interface QwikCityPluginApi {
  getBasePathname: () => string;
  getRoutes: () => BuildRoute[];
  getServiceWorkers: () => BuildEntry[];
}
