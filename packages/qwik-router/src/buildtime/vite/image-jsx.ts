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

// The compiler derives segment hashes from the query-less path, so each param
// variant needs its own path identity or two variants of one image collide.
function hashImageVariant(queryString: string): string {
  let hash = 5381;
  for (let i = 0; i < queryString.length; i++) {
    hash = (hash * 33) ^ queryString.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function createVirtualImageJsxId(pathId: string, params: URLSearchParams) {
  const query = new URLSearchParams(params);
  query.delete(INTERNAL_IMAGE_JSX_QUERY_PARAM);
  const queryString = query.toString();
  const variant = queryString ? `.${hashImageVariant(queryString)}` : '';
  return `${VIRTUAL_IMAGE_JSX_PREFIX}${normalizePath(pathId)}${variant}${VIRTUAL_IMAGE_JSX_SUFFIX}${
    queryString ? `?${queryString}` : ''
  }`;
}

function createImageJsxDirectives(params: URLSearchParams, userOpts?: QwikRouterVitePluginOptions) {
  const overrides = Object.fromEntries(params.entries());
  delete overrides[JSX_QUERY_PARAM];
  delete overrides[INTERNAL_IMAGE_JSX_QUERY_PARAM];

  return new URLSearchParams({
    format: 'webp',
    quality: '75',
    w: '200;400;600;800;1200',
    withoutEnlargement: '',
    ...userOpts?.imageOptimization?.jsxDirectives,
    ...overrides,
    as: 'jsx',
  });
}

export function createImageJsxImportId(
  pathId: string,
  params: URLSearchParams,
  userOpts?: QwikRouterVitePluginOptions
) {
  const query = createImageJsxDirectives(params, userOpts);
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

  let pathId = parsed.pathId.slice(
    VIRTUAL_IMAGE_JSX_PREFIX.length,
    -VIRTUAL_IMAGE_JSX_SUFFIX.length
  );
  const queryString = parsed.params.toString();
  const variant = queryString ? `.${hashImageVariant(queryString)}` : '';
  if (variant && pathId.endsWith(variant)) {
    pathId = pathId.slice(0, -variant.length);
  }

  return {
    ...parsed,
    extension: path.extname(pathId).toLowerCase(),
    pathId,
  };
}

function createImageJsxModule(
  pathId: string,
  params: URLSearchParams,
  userOpts?: QwikRouterVitePluginOptions
) {
  const importId = createImageJsxImportId(pathId, params, userOpts);

  // We get the metadata via the vite-imagetools import; the qwik compiler lowers the JSX
  return `
  import { srcSet, width, height } from ${JSON.stringify(importId)};
  export const QwikImg = (p) =>
    <img decoding="async" loading="lazy" {...p} height={height} srcSet={srcSet} width={width} />;
  export default QwikImg;
  `;
}

function createSvgJsxModule(attrs: Record<string, string>) {
  return `export const QwikSvg = (p) => <svg {...p} {...${JSON.stringify(attrs)}} />;
export default QwikSvg;`;
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
              return createImageJsxDirectives(url.searchParams, userOpts);
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
            return id;
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
              code: createImageJsxModule(imageId.pathId, imageId.params, userOpts),
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
