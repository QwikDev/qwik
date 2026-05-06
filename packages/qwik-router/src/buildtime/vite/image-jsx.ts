import fs from 'node:fs';
import path from 'node:path';
import type { Config as SVGOConfig } from 'svgo';
import { optimize } from 'svgo';
import { normalizePath, type PluginOption } from 'vite';
import type { OutputFormat } from 'vite-imagetools';
import { parseId } from '../../../../qwik-vite/src/plugins/vite-utils';
import type { QwikRouterVitePluginOptions } from './types';

const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tiff'];
const JSX_QUERY_PARAM = 'jsx';
const INTERNAL_IMAGE_JSX_QUERY_PARAM = 'qwik-asset-jsx';
const VIRTUAL_IMAGE_JSX_PREFIX = 'virtual:';
const VIRTUAL_IMAGE_JSX_SUFFIX = '.qwik.jsx';
const TO_IMG_ID = '@to-img.qwik.jsx';
const VIRTUAL_TO_IMG_ID = 'virtual:to-img.qwik.jsx';

export function createVirtualImageJsxId(pathId: string, params: URLSearchParams) {
  const query = new URLSearchParams(params);
  query.delete(INTERNAL_IMAGE_JSX_QUERY_PARAM);
  const queryString = query.toString();
  return `${VIRTUAL_IMAGE_JSX_PREFIX}${normalizePath(pathId)}${VIRTUAL_IMAGE_JSX_SUFFIX}${
    queryString ? `?${queryString}` : ''
  }`;
}

export function createImageJsxImportId(pathId: string, params: URLSearchParams) {
  const query = new URLSearchParams(params);
  query.set(INTERNAL_IMAGE_JSX_QUERY_PARAM, '');
  return `${normalizePath(pathId)}?${query.toString()}`;
}

export function parseVirtualImageJsxId(id: string) {
  const parsed = parseId(id);
  if (
    !parsed.pathId.startsWith(VIRTUAL_IMAGE_JSX_PREFIX) ||
    !parsed.pathId.endsWith(VIRTUAL_IMAGE_JSX_SUFFIX)
  ) {
    return null;
  }

  const pathId = parsed.pathId.slice(
    VIRTUAL_IMAGE_JSX_PREFIX.length,
    -VIRTUAL_IMAGE_JSX_SUFFIX.length
  );

  return {
    ...parsed,
    extension: path.extname(pathId).toLowerCase(),
    pathId,
  };
}

// Keep this up-to-date with jsxSplit changes
function getToImg() {
  return `
  import { _jsxSplit, _getVarProps as v, _getConstProps as c} from '@qwik.dev/core';
  const decoding = "async";
  const loading = "lazy";
  export default (s, w, h) =>
    // Try to preserve const attrs by not spreading when props are not provided
    p => p
    ? _jsxSplit("img", {decoding, loading, ...v(p)}, {...c(p), height: h, srcSet: s, width: w })
    : _jsxSplit("img", null, {decoding, height: h, loading, srcSet: s, width: w});
  `;
}

function createImageJsxModule(pathId: string, params: URLSearchParams) {
  // We get the metadata via the vite-imagetools import
  return `
  import { srcSet, width, height } from ${JSON.stringify(createImageJsxImportId(pathId, params))};
  import toImg from ${JSON.stringify(TO_IMG_ID)};

  export default toImg(srcSet, width, height);
  `;
}

function createSvgJsxModule(attrs: Record<string, string>) {
  return `export default p => <svg {...p} {...${JSON.stringify(attrs)}} />`;
}

/** @public */
export function imagePlugin(userOpts?: QwikRouterVitePluginOptions): PluginOption[] {
  return [
    import('vite-imagetools')
      .then(({ imagetools }) =>
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
                width:
                  largestImage === null || largestImage === void 0 ? void 0 : largestImage.width,
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
            if (url.searchParams.has(JSX_QUERY_PARAM)) {
              const params = Object.fromEntries(url.searchParams.entries());
              delete params[JSX_QUERY_PARAM];
              delete params[INTERNAL_IMAGE_JSX_QUERY_PARAM];
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
      )
      .catch((err) => {
        console.error(
          'Error loading vite-imagetools, image imports ("foo.png?jsx") are not available',
          err
        );
        return null;
      }) as PluginOption,
    {
      name: 'qwik-router-image-jsx',
      resolveId: {
        order: 'pre',
        async handler(id, importer, options) {
          if (parseVirtualImageJsxId(id)) {
            return null;
          }
          if (id.endsWith(TO_IMG_ID)) {
            return VIRTUAL_TO_IMG_ID;
          }

          const { pathId, params } = parseId(id);
          if (!params.has(JSX_QUERY_PARAM) || params.has(INTERNAL_IMAGE_JSX_QUERY_PARAM)) {
            return null;
          }

          const resolved = await this.resolve(pathId, importer, {
            ...options,
            skipSelf: true,
          });
          const resolvedId = parseId((resolved ?? { id: pathId }).id).pathId;
          const extension = path.extname(resolvedId).toLowerCase();

          if (extension !== '.svg' && !supportedExtensions.includes(extension)) {
            return null;
          }

          return {
            id: createVirtualImageJsxId(resolvedId, params),
            moduleSideEffects: false,
          };
        },
      },
      load: {
        order: 'pre',
        handler: async (id) => {
          if (id === VIRTUAL_TO_IMG_ID) {
            return getToImg();
          }
          const imageId = parseVirtualImageJsxId(id);
          if (!imageId) {
            return null;
          }

          if (imageId.extension === '.svg') {
            const code = await fs.promises.readFile(imageId.pathId, 'utf-8');
            return { code, moduleSideEffects: false };
          }

          return {
            code: 'export default undefined;',
            moduleSideEffects: false,
          };
        },
      },
      transform: {
        order: 'pre',
        handler(code, id) {
          const imageId = parseVirtualImageJsxId(id);
          if (!imageId) {
            return null;
          }

          if (imageId.extension === '.svg') {
            const { svgAttributes } = optimizeSvg({ code, path: imageId.pathId }, userOpts);
            return {
              code: createSvgJsxModule(svgAttributes),
              map: null,
            };
          }

          if (supportedExtensions.includes(imageId.extension)) {
            return {
              code: createImageJsxModule(imageId.pathId, imageId.params),
              map: null,
            };
          }

          return null;
        },
      },
    },
  ];
}

export function optimizeSvg(
  { code, path }: { code: string; path: string },
  userOpts?: QwikRouterVitePluginOptions
) {
  const svgAttributes: Record<string, string> = {};
  const prefixIdsConfiguration = userOpts?.imageOptimization?.svgo?.prefixIds;
  const maybePrefixIdsPlugin: SVGOConfig['plugins'] =
    prefixIdsConfiguration !== false ? [{ name: 'prefixIds', params: prefixIdsConfiguration }] : [];

  const userPlugins =
    userOpts?.imageOptimization?.svgo?.plugins?.filter((plugin) => {
      if (
        plugin === 'preset-default' ||
        (typeof plugin === 'object' && plugin.name === 'preset-default')
      ) {
        console.warn(
          `You are trying to use the preset-default SVGO plugin. This plugin is already included by default, you can customize it through the defaultPresetOverrides option.`
        );
        return false;
      }

      if (plugin === 'prefixIds' || (typeof plugin === 'object' && plugin.name === 'prefixIds')) {
        console.warn(
          `You are trying to use the prefixIds SVGO plugin. This plugin is already included by default, you can customize it through the prefixIds option.`
        );
        return false;
      }

      return true;
    }) || [];

  const data = optimize(code, {
    floatPrecision: userOpts?.imageOptimization?.svgo?.floatPrecision,
    multipass: userOpts?.imageOptimization?.svgo?.multipass,
    path: path,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeViewBox: false,
            ...userOpts?.imageOptimization?.svgo?.defaultPresetOverrides,
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
      ...maybePrefixIdsPlugin,
      ...userPlugins,
    ],
  }).data;

  svgAttributes.dangerouslySetInnerHTML = data.slice(3, -4);

  return {
    data,
    svgAttributes,
  };
}
