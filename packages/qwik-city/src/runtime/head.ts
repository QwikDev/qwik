import type { JSXNode } from '@builder.io/qwik';
import { parseHeadJsx } from './jsx';
import type {
  ContentModule,
  HeadComponentProps,
  DocumentHead,
  LoadedContent,
  RouteLocation,
} from './types';

export const resolveHead = (location: RouteLocation, updatedContent: LoadedContent) => {
  const modules = updatedContent.modules;
  const headProps: HeadComponentProps = {
    resolved: { title: '', links: [], meta: [], styles: [] },
    location: { ...location },
  };

  for (let i = modules.length - 1; i >= 0; i--) {
    resolveContentHead(headProps, modules[i]);
  }

  return headProps.resolved;
};

const resolveContentHead = (headProps: HeadComponentProps, mod: ContentModule) => {
  if (mod && typeof mod.head != null) {
    if (typeof mod.head === 'function') {
      resolveDocumentHead(
        headProps.resolved,
        convertHeadComponentToDocumentHead(mod.head(headProps))
      );
    } else if (typeof mod.head === 'object') {
      resolveDocumentHead(headProps.resolved, mod.head);
    }
  }
};

const convertHeadComponentToDocumentHead = (jsxNode: JSXNode | null) => {
  const pageHead: DocumentHead = { title: '', meta: [], links: [], styles: [] };
  parseHeadJsx(pageHead, jsxNode);
  return pageHead;
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
