import { withLocale } from '@qwik.dev/core';
import type {
  ActionInternal,
  ClientActionData,
  ContentModule,
  ContentModuleHead,
  DocumentHeadProps,
  DocumentHeadValue,
  Editable,
  LoaderInternal,
  ResolvedDocumentHead,
  ResolveSyncValue,
  RouteLocation,
} from './types';
import { isPromise } from './utils';

export const resolveHead = async (
  loadersData: Record<string, unknown> | undefined,
  action: ClientActionData | undefined,
  routeLocation: RouteLocation,
  contentModules: ContentModule[],
  locale: string,
  defaults?: DocumentHeadValue
) =>
  withLocale(locale, () => {
    const head = createDocumentHead(defaults);
    const getData = ((loaderOrAction: LoaderInternal | ActionInternal) => {
      const id = loaderOrAction.__id;
      if (loaderOrAction.__brand === 'server_loader') {
        if (!loadersData || !(id in loadersData)) {
          throw new Error(
            'You cannot get the data of a loader that has not been executed for this request.'
          );
        }
        const data = loadersData[id];
        if (isPromise(data)) {
          throw new Error('Loaders returning a promise can not be resolved for the head function.');
        }
        return data;
      } else if (
        action &&
        action.id === loaderOrAction.__id &&
        loaderOrAction.__brand === 'server_action'
      ) {
        return action.data;
      }
      return undefined;
    }) as ResolveSyncValue;

    const fns: Extract<ContentModuleHead, Function>[] = [];
    for (const contentModule of contentModules) {
      const contentModuleHead = contentModule?.head;
      if (contentModuleHead) {
        if (typeof contentModuleHead === 'function') {
          // Functions are executed inner before outer
          fns.unshift(contentModuleHead);
        } else if (typeof contentModuleHead === 'object') {
          // Objects are merged inner over outer
          resolveDocumentHead(head, contentModuleHead);
        }
      }
    }
    if (fns.length) {
      const headProps: DocumentHeadProps = {
        head,
        withLocale: (fn) => fn(),
        resolveValue: getData,
        ...routeLocation,
      };

      for (const fn of fns) {
        resolveDocumentHead(head, fn(headProps));
      }
    }

    return head;
  });

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
