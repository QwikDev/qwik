import type {
  ContentModule,
  RouteLocation,
  EndpointResponse,
  ResolvedDocumentHead,
  DocumentHeadProps,
} from './types';

export const resolveHead = (
  endpoint: EndpointResponse | null,
  routeLocation: RouteLocation,
  contentModules: ContentModule[]
) => {
  const headProps: DocumentHeadProps = {
    data: endpoint ? endpoint.body : null,
    head: createDocumentHead(),
    ...routeLocation,
  };

  for (let i = contentModules.length - 1; i >= 0; i--) {
    resolveContentHead(headProps, contentModules[i]);
  }

  return headProps.head;
};

const resolveContentHead = (headProps: DocumentHeadProps, contentModule: ContentModule) => {
  if (contentModule && typeof contentModule.head != null) {
    if (typeof contentModule.head === 'function') {
      resolveDocumentHead(headProps.head, contentModule.head(headProps));
    } else if (typeof contentModule.head === 'object') {
      resolveDocumentHead(headProps.head, contentModule.head);
    }
  }
};

const resolveDocumentHead = (
  resolvedHead: Required<ResolvedDocumentHead>,
  updatedHead: ResolvedDocumentHead
) => {
  if (typeof updatedHead.title === 'string') {
    resolvedHead.title = updatedHead.title;
  }
  mergeArray(resolvedHead.meta, updatedHead.meta);
  mergeArray(resolvedHead.links, updatedHead.links);
  mergeArray(resolvedHead.styles, updatedHead.styles);
};

const mergeArray = (existingArr: { key?: string }[], newArr: { key?: string }[] | undefined) => {
  if (Array.isArray(newArr)) {
    for (const newItem of newArr) {
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

export const createDocumentHead = (): Required<ResolvedDocumentHead> => ({
  title: '',
  meta: [],
  links: [],
  styles: [],
});
