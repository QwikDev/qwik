import { withLocale } from '@qwik.dev/core';
import type {
  ContentModule,
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
} from './types';
import { isPromise } from './utils';
import { asyncRequestStore } from '../../middleware/request-handler/async-request-store';

export const resolveHead = (
  endpoint: EndpointResponse | ClientPageData,
  routeLocation: RouteLocation,
  contentModules: ContentModule[],
  locale: string,
  defaults?: DocumentHeadValue
) => {
  const head = createDocumentHead(defaults);
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
  // Qwik Core will also be using the async store if this is present
  const hasAsyncStore = asyncRequestStore;
  const headProps: DocumentHeadProps = {
    head,
    withLocale: hasAsyncStore ? (fn) => fn() : (fn) => withLocale(locale, fn),
    resolveValue: getData,
    ...routeLocation,
  };

  for (let i = contentModules.length - 1; i >= 0; i--) {
    const contentModuleHead = contentModules[i] && contentModules[i].head;
    if (contentModuleHead) {
      if (typeof contentModuleHead === 'function') {
        resolveDocumentHead(
          head,
          hasAsyncStore
            ? contentModuleHead(headProps)
            : withLocale(locale, () => contentModuleHead(headProps))
        );
      } else if (typeof contentModuleHead === 'object') {
        resolveDocumentHead(head, contentModuleHead);
      }
    }
  }

  return headProps.head;
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
