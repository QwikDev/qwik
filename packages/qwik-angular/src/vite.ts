import originalAngularPluginsImport, {
  type PluginOptions as ViteAngularPluginOptions,
} from '@analogjs/vite-plugin-angular';
import type {
  TransformModule,
  QwikPluginAddon,
  QwikVitePluginApi,
} from '@builder.io/qwik/optimizer';
import type { Plugin } from 'vite';

// default import from the '@analogjs/vite-plugin-angular' is not resolved properly
const originalAngularPlugins = (originalAngularPluginsImport as any).default as typeof originalAngularPluginsImport;

const ANALOG_ANGULAR_PLUGIN = '@analogjs/vite-plugin-angular';
const QWIK_PLUGIN = 'vite-plugin-qwik';

export type PluginOptions = ViteAngularPluginOptions & {
  componentsDir: string;
};

export function angular(options: PluginOptions) {
  const plugins: any[] = originalAngularPlugins(options); // returns an array of 2 plugins

  for (const p of plugins) {
    if (p.name === ANALOG_ANGULAR_PLUGIN) {
      // rename the transform method so that it is called manually
      p['qwikAngularTransform'] = p.transform;
      delete p.transform;
    }
    p.enforce = 'pre'; // so that angular plugins are executed at the same time as qwik ones
  }
  return [...plugins, analogQwikPlugin(options)];
}

function analogQwikPlugin(pluginOptions: PluginOptions) {
  let qwikVitePlugin!: Plugin;
  let analogPlugin!: Plugin;

  const addon: Plugin & QwikPluginAddon = {
    name: 'vite-plugin-qwik-angular',
    enforce: 'pre',

    config() {
      return {
        optimizeDeps: {
          include: ['@angular/core', '@angular/platform-browser'],
          exclude: ['@angular/platform-server']
        },
        build: {
          "rollupOptions": {
              external: ['domino']
          }
      },
      };
    },

    async configResolved(config) {
      qwikVitePlugin = config.plugins.find((p) => p.name === QWIK_PLUGIN)!;
      analogPlugin = config.plugins.find((p) => p.name === ANALOG_ANGULAR_PLUGIN)!;
      if (!qwikVitePlugin) {
        throw new Error(`Missing ${QWIK_PLUGIN}`);
      }
      (qwikVitePlugin.api as QwikVitePluginApi).registerQwikPluginAddon(addon);
    },

    onBeforeTransform(qwikOptions, code, id) {
      if (id.includes(pluginOptions.componentsDir)) {
        return (analogPlugin as any).qwikAngularTransform(code, id);
      }
    },

    async postProcessTransformOutput(qwikOptions, result) {
      const modules = result.modules;
      const sys = (qwikVitePlugin.api as QwikVitePluginApi).getOptimizer()!.sys;
      const fs: typeof import('fs') = await sys.dynamicImport('node:fs');

      const transformedAngularComponents = new Map<string, TransformModule>();

      const tmpDir = `${qwikOptions.srcDir}/tmp/ng`;

      await fs.promises.mkdir(tmpDir, { recursive: true });

      for (const module of modules) {
        if (module.path.includes(pluginOptions.componentsDir)) {
          const tmpPath = sys.path.join(tmpDir, module.path.replace(/\//g, '--'));
          await fs.promises.writeFile(tmpPath, module.code);
          transformedAngularComponents.set(tmpPath, module);
        }
      }

      if (transformedAngularComponents.size) {
        await (analogPlugin as any).buildStart({});
        for (const [path, module] of transformedAngularComponents.entries()) {
          const ngCompiled = (await (analogPlugin as any).qwikAngularTransform(module.code, path))
            ?.code;
          if (ngCompiled) {
            module.code = ngCompiled;
          }
          await fs.promises.unlink(path);
        }
      }
    },
  };
  return addon;
}
