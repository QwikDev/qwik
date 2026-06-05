import { type Plugin } from 'vite';
import VueInspector from 'vite-plugin-inspect';
import { createBuildAnalysisPlugins } from '../build-analysis';
import { devtoolsPlugin } from './devtools';
import { statisticsPlugin } from './statistics';
import type { QwikDevtoolsOptions } from '../virtualmodules/virtualModules';

// Re-export individual plugins
export { devtoolsPlugin } from './devtools';
export type { QwikDevtoolsOptions } from '../virtualmodules/virtualModules';

/** Main entry: combines all devtools plugins */
export function qwikDevtools(opts: QwikDevtoolsOptions = {}): Plugin[] {
  return [
    devtoolsPlugin(opts),
    { ...VueInspector(), apply: 'serve' },
    statisticsPlugin(),
    ...createBuildAnalysisPlugins(),
    // Add more plugins here as needed
  ];
}
