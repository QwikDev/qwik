import originalAngularPluginsImport, {
  type PluginOptions as ViteAngularPluginOptions,
} from '@analogjs/vite-plugin-angular';
import type { Plugin } from 'vite';

// default import from the '@analogjs/vite-plugin-angular' is not resolved properly
const originalAngularPlugins = (originalAngularPluginsImport as any)
  .default as typeof originalAngularPluginsImport;

const ANALOG_ANGULAR_PLUGIN = '@analogjs/vite-plugin-angular';

export type PluginOptions = ViteAngularPluginOptions & {
  componentsDir: string;
};

export function angular(options: PluginOptions) {
  const plugins = originalAngularPlugins(options); // returns an array of 2 plugins

  for (const p of plugins) {
    if (p.name === ANALOG_ANGULAR_PLUGIN) {
      // rename the transform method so that it is called manually
      const transform = p.transform;
      p.transform = function (code, id, ssrOpts) {
        if (!id.includes(options.componentsDir)) {
          return;
        }
        return (<any>transform).call(this, code, id, ssrOpts);
      };
    }
  }
  return [...plugins, analogQwikPlugin()];
}

function analogQwikPlugin() {
  const vitePluginQwikAngular: Plugin = {
    name: 'vite-plugin-qwik-angular',

    config() {
      return {
        optimizeDeps: {
          include: ['@angular/core', '@angular/platform-browser', '@angular/compiler'],
          exclude: ['@angular/platform-server'],
        },
      };
    },
  };
  return vitePluginQwikAngular;
}
