import { parseHeadJsx } from './jsx';
import type { ContentModule, HeadComponentProps, DocumentHead, RouteLocation } from './types';

export const resolveHead = (routeLocation: RouteLocation, contentModules: ContentModule[]) => {
  const headProps: HeadComponentProps = {
    resolved: createDocumentHead(),
    location: JSON.parse(JSON.stringify(routeLocation)),
  };

  for (let i = contentModules.length - 1; i >= 0; i--) {
    resolveContentHead(headProps, contentModules[i]);
  }

  return headProps.resolved;
};

const resolveContentHead = (headProps: HeadComponentProps, contentModule: ContentModule) => {
  if (contentModule && typeof contentModule.head != null) {
    if (typeof contentModule.head === 'function') {
      const parsedHeadJsxData = createDocumentHead();
      parseHeadJsx(parsedHeadJsxData, contentModule.head(headProps));
      resolveDocumentHead(headProps.resolved, parsedHeadJsxData);
    } else if (typeof contentModule.head === 'object') {
      resolveDocumentHead(headProps.resolved, contentModule.head);
    }
  }
};

const resolveDocumentHead = (resolvedHead: DocumentHead, updatedHead: DocumentHead) => {
  if (typeof updatedHead.title === 'string') {
    resolvedHead.title = updatedHead.title;
  }
  mergeArray(resolvedHead.meta, updatedHead.meta);
  mergeArray(resolvedHead.links, updatedHead.links);
  mergeArray(resolvedHead.styles, updatedHead.styles);
};

const mergeArray = (existingArr: { key?: string }[], newArr: { key?: string }[]) => {
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

export const createDocumentHead = (): DocumentHead => ({
  title: '',
  meta: [],
  links: [],
  styles: [],
});
