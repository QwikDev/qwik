import type { MdxTransform } from '../markdown/mdx';
import type { BuildContext, PluginOptions, MdxPlugins } from '../types';

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
