import { withLocale, isDev } from '@builder.io/qwik';
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
  DocumentMeta,
  DocumentLink,
  DocumentStyle,
  DocumentScript,
} from './types';
import { isPromise } from './utils';

export const resolveHead = (
  endpoint: EndpointResponse | ClientPageData,
  routeLocation: RouteLocation,
  contentModules: ContentModule[],
  locale: string
) => {
  const head = createDocumentHead();
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
  const headProps: DocumentHeadProps = {
    head,
    withLocale: (fn) => withLocale(locale, fn),
    resolveValue: getData,
    ...routeLocation,
  };

  for (let i = contentModules.length - 1; i >= 0; i--) {
    const contentModuleHead = contentModules[i] && contentModules[i].head;
    if (contentModuleHead) {
      if (typeof contentModuleHead === 'function') {
        resolveDocumentHead(
          head,
          withLocale(locale, () => contentModuleHead(headProps))
        );
      } else if (typeof contentModuleHead === 'object') {
        resolveDocumentHead(head, contentModuleHead);
      }
    }
  }

  return headProps.head;
};

export const resolveDocumentHead = (
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
  existingArr: (DocumentMeta | DocumentLink | DocumentStyle | DocumentScript)[][],
  newArr: readonly (DocumentMeta | DocumentLink | DocumentStyle | DocumentScript)[] | undefined
) => {
  // There are two situations
  // 1. the item hasn't key property, but other properties are the same
  // 2. the item has key property, and the other properties are the same
  // so do have to compare the serialization of the item to make sure the item is the same
  if (!Array.isArray(newArr)) {
    return;
  }
  for (const newItem of newArr) {
    try {
      const serialized = JSON.stringify(newItem);
      const existingIndex = existingArr.findIndex((i) => JSON.stringify(i) === serialized);
      if (existingIndex > -1) {
        // Replace existing item with same serialization
        existingArr[existingIndex] = newItem;
      } else {
        // Add new item if it doesn't exist
        existingArr.push(newItem);
      }
    } catch (err) {
      if (isDev) {
        console.warn(
          'Qwik City: Failed to merge document head item. ' +
            'Item may contain non-serializable values. Skipping item.',
          err,
          newItem
        );
      }
    }
  }
};

export const createDocumentHead = (): ResolvedDocumentHead => ({
  title: '',
  meta: [],
  links: [],
  styles: [],
  scripts: [],
  frontmatter: {},
});
