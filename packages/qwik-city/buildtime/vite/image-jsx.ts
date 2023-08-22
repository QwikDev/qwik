import type { OutputFormat } from 'vite-imagetools';
import type { PluginOption } from 'vite';
import { optimize } from 'svgo';
import fs from 'node:fs';
import path from 'node:path';
import { parseId } from 'packages/qwik/src/optimizer/src/plugins/plugin';
import type { QwikCityVitePluginOptions } from './types';

/**
 * @public
 */
export function imagePlugin(userOpts?: QwikCityVitePluginOptions): PluginOption[] {
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tiff'];
  return [
    import('vite-imagetools').then(({ imagetools }) =>
      imagetools({
        exclude: [],
        extendOutputFormats(builtins) {
          const jsx: OutputFormat = () => (metadatas) => {
            const srcSet = metadatas.map((meta) => `${meta.src} ${meta.width}w`).join(', ');
            let largestImage: any;
            let largestImageSize = 0;
            for (let i = 0; i < metadatas.length; i++) {
              const m = metadatas[i] as any;
              if (m.width > largestImageSize) {
                largestImage = m;
                largestImageSize = m.width;
              }
            }
            return {
              srcSet,
              width: largestImage === null || largestImage === void 0 ? void 0 : largestImage.width,
              height:
                largestImage === null || largestImage === void 0 ? void 0 : largestImage.height,
            };
          };
          return {
            ...builtins,
            jsx,
          };
        },
        defaultDirectives: (url) => {
          if (url.searchParams.has('jsx')) {
            const { jsx, ...params } = Object.fromEntries(url.searchParams.entries());
            return new URLSearchParams({
              format: 'webp',
              quality: '75',
              w: '200;400;600;800;1200',
              withoutEnlargement: '',
              ...userOpts?.imageOptimization?.jsxDirectives,
              ...params,
              as: 'jsx',
            });
          }
          return new URLSearchParams();
        },
      })
    ),
    {
      name: 'qwik-city-image-jsx',
      load: {
        order: 'pre',
        handler: async (id) => {
          const { params, pathId } = parseId(id);
          const extension = path.extname(pathId).toLowerCase();
          if (extension === '.svg' && params.has('jsx')) {
            const code = await fs.promises.readFile(pathId, 'utf-8');
            return {
              code,
              moduleSideEffects: false,
            };
          }
        },
      },
      transform(code, id) {
        id = id.toLowerCase();
        const { params, pathId } = parseId(id);
        if (params.has('jsx')) {
          const extension = path.extname(pathId).toLowerCase();

          if (supportedExtensions.includes(extension)) {
            if (!code.includes('srcSet')) {
              this.error(`Image '${id}' could not be optimized to JSX`);
            }
            const index = code.indexOf('export default');
            return (
              code.slice(0, index) +
              `
  import { _jsxQ } from '@builder.io/qwik';
  const PROPS = {srcSet, width, height};
  export default function (props, key, _, dev) {
    return _jsxQ('img', {...{decoding: 'async', loading: 'lazy'}, ...props}, PROPS, undefined, 3, key, dev);
  }`
            );
          } else if (extension === '.svg') {
            const svgAttributes: Record<string, string> = {};
            const data = optimize(code, {
              plugins: [
                {
                  name: 'preset-default',
                  params: {
                    overrides: {
                      removeViewBox: false,
                    },
                  },
                },
                {
                  name: 'customPluginName',
                  fn: () => {
                    return {
                      element: {
                        exit: (node) => {
                          if (node.name === 'svg') {
                            node.name = 'g';
                            Object.assign(svgAttributes, node.attributes);
                            node.attributes = {};
                          }
                        },
                      },
                    };
                  },
                },
              ],
            }).data;
            svgAttributes.dangerouslySetInnerHTML = data.slice(3, -3);
            return `
  import { _jsxQ } from '@builder.io/qwik';
  const PROPS = ${JSON.stringify(svgAttributes)};
  export default function (props, key, _, dev) {
    return _jsxQ('svg', props, PROPS, undefined, 3, key, dev);
  }`;
          }
        }
        return null;
      },
    },
  ];
}
