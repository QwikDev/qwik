import originalAngularPluginsImport, {
  type PluginOptions as ViteAngularPluginOptions,
} from '@analogjs/vite-plugin-angular';
import type { Plugin } from 'vite';
import { compile, type Options } from 'sass';

// default import from the '@analogjs/vite-plugin-angular' is not resolved properly
const originalAngularPlugins = (originalAngularPluginsImport as any)
  .default as typeof originalAngularPluginsImport;

const ANALOG_ANGULAR_PLUGIN = '@analogjs/vite-plugin-angular';

export type PluginOptions = ViteAngularPluginOptions & {
  componentsDir: string;
  bundleSassFilesInDevMode?: {
    paths: string[];
    compileOptions?: Options<'sync'>;
  };
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
  return [...plugins, analogQwikPlugin(options)];
}

function analogQwikPlugin(options: PluginOptions) {
  const bundleSassFilePaths = options.bundleSassFilesInDevMode?.paths;
  let viteCommand: 'build' | 'serve' = 'serve';

  const vitePluginQwikAngular: Plugin = {
    name: 'vite-plugin-qwik-angular',

    config(viteConfig, viteEnv) {
      viteCommand = viteEnv.command;

      return {
        optimizeDeps: {
          include: [
            "@angular/core",
            "@angular/platform-browser",
            "@angular/platform-browser/animations",
            "@angular/compiler",
            "@angular/common",
            "@angular/animations",
            "@angular/animations/browser",
          ],
          exclude: ['@angular/platform-server'],
        },
      };
    },

    load: function (id) {
      if (viteCommand !== 'serve') {
        return;
      }

      if (bundleSassFilePaths?.some((p) => id.includes(p))) {
        // TODO: normalize path
        id = id.replace(/\?(.*)/, '');
        try {
          const compiledAsset = compile(id, options.bundleSassFilesInDevMode?.compileOptions).css;
          return compiledAsset;
        } catch (e) {
          // if failed to compile, do nothing
        }
      }
    },
  };
  return vitePluginQwikAngular;
}
