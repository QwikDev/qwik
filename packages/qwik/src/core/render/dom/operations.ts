import { codeToText, QError_setProperty } from '../../error/error';
import type { StyleAppend } from '../../use/use-core';
import { logDebug, logError, logWarn } from '../../util/log';
import { QStyle } from '../../util/markers';
import { qDev } from '../../util/qdev';
import type { SubscriptionManager } from '../container';
import { directSetAttribute } from '../fast-calls';
import type { RenderStaticContext } from '../types';
import type { QwikElement, VirtualElement } from './virtual-element';
import {
  cleanupTree,
  directAppendChild,
  directInsertBefore,
  directRemoveChild,
  SVG_NS,
} from './visitor';

export const setAttribute = (
  ctx: RenderStaticContext | undefined,
  el: QwikElement,
  prop: string,
  value: any
) => {
  if (ctx) {
    ctx.$operations$.push({
      $operation$: _setAttribute,
      $args$: [el, prop, value],
    });
  } else {
    _setAttribute(el, prop, value);
  }
};

const _setAttribute = (el: QwikElement, prop: string, value: any) => {
  if (value == null || value === false) {
    el.removeAttribute(prop);
  } else {
    const str = value === true ? '' : String(value);
    directSetAttribute(el, prop, str);
  }
};

export const setProperty = (
  ctx: RenderStaticContext | undefined,
  node: any,
  key: string,
  value: any
) => {
  if (ctx) {
    ctx.$operations$.push({
      $operation$: _setProperty,
      $args$: [node, key, value],
    });
  } else {
    _setProperty(node, key, value);
  }
};

const _setProperty = (node: any, key: string, value: any) => {
  try {
    node[key] = value;
  } catch (err) {
    logError(codeToText(QError_setProperty), { node, key, value }, err);
  }
};

export const createElement = (doc: Document, expectTag: string, isSvg: boolean): Element => {
  const el = isSvg ? doc.createElementNS(SVG_NS, expectTag) : doc.createElement(expectTag);

  return el;
};

export const insertBefore = <T extends Node | VirtualElement>(
  ctx: RenderStaticContext,
  parent: QwikElement,
  newChild: T,
  refChild: Node | VirtualElement | null | undefined
): T => {
  ctx.$operations$.push({
    $operation$: directInsertBefore,
    $args$: [parent, newChild, refChild ? refChild : null],
  });
  return newChild;
};

export const appendHeadStyle = (ctx: RenderStaticContext, styleTask: StyleAppend) => {
  ctx.$containerState$.$styleIds$.add(styleTask.styleId);
  ctx.$postOperations$.push({
    $operation$: _appendHeadStyle,
    $args$: [ctx.$doc$, ctx.$containerEl$, styleTask],
  });
};

export const _appendHeadStyle = (doc: Document, containerEl: Element, styleTask: StyleAppend) => {
  const isDoc = doc.documentElement === containerEl;
  const headEl = doc.head;
  const style = doc.createElement('style');
  if (isDoc && !headEl) {
    logWarn('document.head is undefined');
  }
  directSetAttribute(style, QStyle, styleTask.styleId);
  style.textContent = styleTask.content;
  if (isDoc && headEl) {
    directAppendChild(headEl, style);
  } else {
    directInsertBefore(containerEl, style, containerEl.firstChild);
  }
};

export const prepend = (ctx: RenderStaticContext, parent: QwikElement, newChild: Node) => {
  ctx.$operations$.push({
    $operation$: directInsertBefore,
    $args$: [parent, newChild, parent.firstChild],
  });
};

export const removeNode = (ctx: RenderStaticContext, el: Node | VirtualElement) => {
  ctx.$operations$.push({
    $operation$: _removeNode,
    $args$: [el, ctx.$containerState$.$subsManager$],
  });
};

const _removeNode = (el: Element, subsManager: SubscriptionManager) => {
  const parent = el.parentElement;
  if (parent) {
    if (el.nodeType === 1 || el.nodeType === 111) {
      cleanupTree(el as Element, subsManager);
    }
    directRemoveChild(parent, el);
  } else if (qDev) {
    logWarn('Trying to remove component already removed', el);
  }
};

export const executeDOMRender = (ctx: RenderStaticContext) => {
  for (const op of ctx.$operations$) {
    op.$operation$.apply(undefined, op.$args$);
  }
};

export const createTextNode = (doc: Document, text: string): Text => {
  return doc.createTextNode(text);
};

export const printRenderStats = (ctx: RenderStaticContext) => {
  if (qDev) {
    if (typeof window !== 'undefined' && window.document != null) {
      const byOp: Record<string, number> = {};
      for (const op of ctx.$operations$) {
        byOp[op.$operation$.name] = (byOp[op.$operation$.name] ?? 0) + 1;
      }
      const stats = {
        byOp,
        roots: ctx.$roots$.map((ctx) => ctx.$element$),
        hostElements: Array.from(ctx.$hostElements$),
        operations: ctx.$operations$.map((v) => [v.$operation$.name, ...v.$args$]),
      };
      const noOps = ctx.$operations$.length === 0;
      logDebug('Render stats.', noOps ? 'No operations' : '', stats);
    }
  }
};
