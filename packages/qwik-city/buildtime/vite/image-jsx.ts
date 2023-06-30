import fs from 'node:fs';
import { parseId } from 'packages/qwik/src/optimizer/src/plugins/plugin';
import { optimize } from 'svgo';
import type { PluginOption } from 'vite';
import type { OutputFormat } from 'vite-imagetools';

/**
 * @public
 */
export function imagePlugin(): PluginOption[] {
  const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'tiff'].map(
    (ext) => `.${ext}?jsx`
  );
  return [
    import('vite-imagetools').then(({ imagetools }) =>
      imagetools({
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
            return new URLSearchParams({
              format: 'webp',
              quality: '75',
              w: '200;400;800;1200',
              as: 'jsx',
            });
          }
          return new URLSearchParams();
        },
      })
    ),
    {
      name: 'qwik-city-image',
      load: {
        order: 'pre',
        handler: async (id) => {
          if (id.endsWith('.svg?jsx')) {
            const code = await fs.promises.readFile(parseId(id).pathId, 'utf-8');
            return {
              code,
              moduleSideEffects: false,
            };
          }
        },
      },
      transform: (code, id) => {
        id = id.toLowerCase();
        if (id.endsWith('?jsx')) {
          if (supportedExtensions.some((ext) => id.endsWith(ext))) {
            const index = code.indexOf('export default');
            return (
              code.slice(0, index) +
              `
  import { _jsxQ } from '@builder.io/qwik';
  const PROPS = {decoding: 'async', loading: 'lazy', srcSet, width, height};
  export default function (props, key, _, dev) {
    return _jsxQ('img', props, PROPS, undefined, 3, key, dev);
  }`
            );
          } else if (id.endsWith('.svg?jsx')) {
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
