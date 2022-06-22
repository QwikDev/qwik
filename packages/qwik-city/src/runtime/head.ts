import { jsx, JSXNode } from '@builder.io/qwik';
import { parseHeadJsx } from './jsx';
import type { ContentModule, HeadComponentProps, Page, PageHead, Route } from './types';

export const resolveHeadProps = (route: Route, page: Page, modules: ContentModule[]) => {
  const headProps: HeadComponentProps = {
    resolved: { title: '', meta: {}, links: [], scripts: [], styles: [] },
    page: { ...page },
    route: { ...route },
  };

  for (let i = modules.length - 1; i >= 0; i--) {
    resolveContentHead(headProps, modules[i]);
  }

  return headProps;
};

export const createHeadCmp = (headProps: HeadComponentProps) => {
  return () => {
    const resolvedHead = headProps.resolved;
    const headChildren: JSXNode[] = [jsx('title', { children: resolvedHead.title })];

    for (const link of resolvedHead.links) {
      jsx('link', { ...link, key: undefined }, link.key);
    }

    for (const style of resolvedHead.styles) {
      jsx('style', { ...style.attributes, dangerouslySetInnerHTML: style.style }, style.key);
    }

    for (const script of resolvedHead.scripts) {
      jsx('script', { ...script, dangerouslySetInnerHTML: script.script || '' }, script.key);
    }

    return jsx('head', { children: headChildren });
  };
};

const resolveContentHead = (headProps: HeadComponentProps, mod: ContentModule) => {
  if (mod && typeof mod.head != null) {
    if (typeof mod.head === 'function') {
      resolvePageHead(headProps.resolved, convertHeadComponentToPageHead(mod.head(headProps)));
    } else if (typeof mod.head === 'object') {
      resolvePageHead(headProps.resolved, mod.head);
    }
  }
};

const convertHeadComponentToPageHead = (jsxNode: JSXNode | null) => {
  const pageHead: PageHead = { title: '', meta: {}, links: [], scripts: [], styles: [] };
  parseHeadJsx(pageHead, jsxNode);
  return pageHead;
};

const resolvePageHead = (resolvedHead: PageHead, pageHead: PageHead) => {
  if (typeof pageHead.title === 'string') {
    resolvedHead.title = pageHead.title;
  }
  if (pageHead.meta != null && typeof pageHead.meta === 'object') {
    resolvedHead.meta = { ...resolvedHead.meta, ...pageHead.meta };
  }
  mergeArray(resolvedHead.links, pageHead.links);
  mergeArray(resolvedHead.styles, pageHead.styles);
  mergeArray(resolvedHead.scripts, pageHead.scripts);
};

const mergeArray = (existingArr: { key?: string }[], newArr: { key?: string }[]) => {
  if (Array.isArray(newArr)) {
    for (const newItem of newArr) {
      if (newItem.key) {
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
