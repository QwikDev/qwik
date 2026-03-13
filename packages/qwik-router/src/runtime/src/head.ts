import { withLocale } from '@qwik.dev/core';
import type {
  CacheKeyFn,
  ContentModule,
  ContentModuleETag,
  RouteLocation,
  EndpointResponse,
  ResolvedDocumentHead,
  DocumentHeadProps,
  DocumentHeadValue,
  ClientPageData,
  LoaderInternal,
  Editable,
  ResolveSyncValue,
  ActionInternal,
  RouteConfig,
  RouteConfigValue,
} from './types';
import { isPromise } from './utils';

export interface ResolvedRouteConfig {
  head: ResolvedDocumentHead;
  eTag: ContentModuleETag | undefined;
  cacheKey: CacheKeyFn | undefined;
}

/**
 * Resolve the full route config (head + eTag + cacheKey) from all content modules. Uses the same
 * resolution rules as DocumentHead: objects are merged immediately, functions are queued and
 * executed inner-before-outer.
 */
export const resolveRouteConfig = (
  resolveValue: ResolveSyncValue,
  routeLocation: RouteLocation,
  contentModules: ContentModule[],
  locale: string,
  defaults?: DocumentHeadValue
): ResolvedRouteConfig =>
  withLocale(locale, () => {
    const head = createDocumentHead(defaults);
    let eTag: ContentModuleETag | undefined;
    let cacheKey: CacheKeyFn | undefined;

    const fns: { fn: Extract<RouteConfig, Function>; isLast: boolean }[] = [];
    for (let i = 0; i < contentModules.length; i++) {
      const contentModule = contentModules[i];
      if (!contentModule) {
        continue;
      }
      const isLast = i === contentModules.length - 1;

      // If module exports routeConfig, use it exclusively; otherwise synthesize from separate exports
      let config: RouteConfig | undefined;
      if (contentModule.routeConfig) {
        config = contentModule.routeConfig;
      } else if (contentModule.head) {
        // Synthesize RouteConfigValue from separate exports
        const synthetic: RouteConfigValue = { head: undefined };
        const headExport = contentModule.head;
        if (typeof headExport === 'function') {
          // Wrap the head function into a routeConfig function
          const mod = contentModule as { eTag?: ContentModuleETag; cacheKey?: CacheKeyFn };
          config = (props: DocumentHeadProps) => ({
            head: headExport(props),
            eTag: mod.eTag,
            cacheKey: mod.cacheKey,
          });
        } else {
          (synthetic as Editable<RouteConfigValue>).head = headExport;
          const mod = contentModule as { eTag?: ContentModuleETag; cacheKey?: CacheKeyFn };
          if (mod.eTag !== undefined) {
            (synthetic as Editable<RouteConfigValue>).eTag = mod.eTag;
          }
          if (mod.cacheKey !== undefined) {
            (synthetic as Editable<RouteConfigValue>).cacheKey = mod.cacheKey;
          }
          config = synthetic;
        }
      } else {
        // No routeConfig and no head — check for standalone eTag/cacheKey
        const mod = contentModule as { eTag?: ContentModuleETag; cacheKey?: CacheKeyFn };
        if (mod.eTag !== undefined || mod.cacheKey !== undefined) {
          config = { eTag: mod.eTag, cacheKey: mod.cacheKey };
        }
      }

      if (!config) {
        continue;
      }

      if (typeof config === 'function') {
        // Functions are executed inner before outer
        fns.unshift({ fn: config, isLast });
      } else {
        // Objects are merged immediately
        if (config.head) {
          resolveDocumentHead(head, config.head);
        }
        if (config.eTag !== undefined) {
          eTag = config.eTag;
        }
        if (config.cacheKey !== undefined) {
          cacheKey = config.cacheKey;
        }
      }
    }

    if (fns.length) {
      const headProps: DocumentHeadProps = {
        head,
        withLocale: (fn) => fn(),
        resolveValue,
        ...routeLocation,
      };

      for (const { fn } of fns) {
        const result = fn(headProps);
        if (result.head) {
          resolveDocumentHead(head, result.head);
        }
        if (result.eTag !== undefined) {
          eTag = result.eTag;
        }
        if (result.cacheKey !== undefined) {
          cacheKey = result.cacheKey;
        }
      }
    }

    return { head, eTag, cacheKey };
  });

/**
 * Resolve only the document head from all content modules. This is the browser-side entry point
 * that ignores eTag/cacheKey (server-only concerns).
 */
export const resolveHead = (
  endpoint: EndpointResponse | ClientPageData,
  routeLocation: RouteLocation,
  contentModules: ContentModule[],
  locale: string,
  defaults?: DocumentHeadValue
): ResolvedDocumentHead => {
  const getData = ((loaderOrAction: LoaderInternal | ActionInternal) => {
    const id = loaderOrAction.__id;
    if (loaderOrAction.__brand === 'server_loader') {
      if (!(id in endpoint.loaders)) {
        throw new Error(
          'You can not get the returned data of a loader that has not been executed for this request.'
        );
      }
    }
    const data = endpoint.loaders[id];
    if (isPromise(data)) {
      throw new Error('Loaders returning a promise can not be resolved for the head function.');
    }
    return data;
  }) as any as ResolveSyncValue;

  return resolveRouteConfig(getData, routeLocation, contentModules, locale, defaults).head;
};

const resolveDocumentHead = (
  resolvedHead: Editable<ResolvedDocumentHead>,
  updatedHead: DocumentHeadValue
) => {
  if (typeof updatedHead.title === 'string') {
    resolvedHead.title = updatedHead.title;
  }
  mergeArray(resolvedHead.meta as any, updatedHead.meta);
  mergeArray(resolvedHead.links as any, updatedHead.links);
  mergeArray(resolvedHead.styles as any, updatedHead.styles);
  mergeArray(resolvedHead.scripts as any, updatedHead.scripts);
  Object.assign(resolvedHead.frontmatter, updatedHead.frontmatter);
};

const mergeArray = (
  existingArr: { key?: string | number | null }[],
  newArr: readonly { key?: string | number | null }[] | undefined
) => {
  if (Array.isArray(newArr)) {
    for (const newItem of newArr) {
      // items with the same string key are replaced
      if (typeof newItem.key === 'string') {
        const existingIndex = existingArr.findIndex((i) => i.key === newItem.key);
        if (existingIndex > -1) {
          existingArr[existingIndex] = newItem;
          continue;
        }
      }
      existingArr.push(newItem);
    }
  }
};

export const createDocumentHead = (defaults?: DocumentHeadValue): ResolvedDocumentHead => ({
  title: defaults?.title || '',
  meta: [...(defaults?.meta || [])],
  links: [...(defaults?.links || [])],
  styles: [...(defaults?.styles || [])],
  scripts: [...(defaults?.scripts || [])],
  frontmatter: { ...defaults?.frontmatter },
});
