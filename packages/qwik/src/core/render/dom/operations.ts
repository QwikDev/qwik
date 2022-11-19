import { assertDefined } from '../../error/assert';
import { codeToText, QError_setProperty } from '../../error/error';
import type { StyleAppend } from '../../use/use-core';
import { getDocument } from '../../util/dom';
import { isElement, isNode } from '../../util/element';
import { logDebug, logError, logWarn } from '../../util/log';
import { QSlot, QSlotRef, QStyle } from '../../util/markers';
import { qDev } from '../../util/qdev';
import { directGetAttribute, directSetAttribute } from '../fast-calls';
import type { RenderStaticContext } from '../types';
import type { QwikElement, VirtualElement } from './virtual-element';
import {
  cleanupTree,
  directAppendChild,
  directInsertBefore,
  directRemoveChild,
  getChildren,
  isSlotTemplate,
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
    node[key] = value == null ? '' : value;
    if (value == null && isNode(node) && isElement(node)) {
      node.removeAttribute(key);
    }
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

export const appendChild = <T extends Node | VirtualElement>(
  ctx: RenderStaticContext,
  parent: QwikElement,
  newChild: T
): T => {
  ctx.$operations$.push({
    $operation$: directAppendChild,
    $args$: [parent, newChild],
  });
  return newChild;
};

export const appendHeadStyle = (ctx: RenderStaticContext, styleTask: StyleAppend) => {
  ctx.$containerState$.$styleIds$.add(styleTask.styleId);
  ctx.$postOperations$.push({
    $operation$: _appendHeadStyle,
    $args$: [ctx.$containerState$.$containerEl$, styleTask],
  });
};

export const setClasslist = (
  ctx: RenderStaticContext | undefined,
  elm: Element,
  toRemove: string[],
  toAdd: string[]
) => {
  if (ctx) {
    ctx.$operations$.push({
      $operation$: _setClasslist,
      $args$: [elm, toRemove, toAdd],
    });
  } else {
    _setClasslist(elm, toRemove, toAdd);
  }
};

export const _setClasslist = (elm: Element, toRemove: string[], toAdd: string[]) => {
  const classList = elm.classList;
  classList.remove(...toRemove);
  classList.add(...toAdd);
};

export const _appendHeadStyle = (containerEl: Element, styleTask: StyleAppend) => {
  const doc = getDocument(containerEl);
  const isDoc = doc.documentElement === containerEl;
  const headEl = doc.head;
  const style = doc.createElement('style');
  if (isDoc && !headEl) {
    logWarn('document.head is undefined');
  }
  directSetAttribute(style, QStyle, styleTask.styleId);
  directSetAttribute(style, 'hidden', '');

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
    $args$: [el, ctx],
  });
};

const _removeNode = (el: Node | VirtualElement, staticCtx: RenderStaticContext) => {
  const parent = el.parentElement;
  if (parent) {
    if (el.nodeType === 1 || el.nodeType === 111) {
      const subsManager = staticCtx.$containerState$.$subsManager$;
      cleanupTree(el as Element, staticCtx, subsManager, true);
    }
    directRemoveChild(parent, el);
  } else if (qDev) {
    logWarn('Trying to remove component already removed', el);
  }
};

export const createTemplate = (doc: Document, slotName: string) => {
  const template = createElement(doc, 'q:template', false);
  directSetAttribute(template, QSlot, slotName);
  directSetAttribute(template, 'hidden', '');
  directSetAttribute(template, 'aria-hidden', 'true');

  return template;
};

export const executeDOMRender = (ctx: RenderStaticContext) => {
  for (const op of ctx.$operations$) {
    op.$operation$.apply(undefined, op.$args$);
  }
  resolveSlotProjection(ctx);
};

export const getKey = (el: QwikElement): string | null => {
  return directGetAttribute(el, 'q:key');
};

export const setKey = (el: QwikElement, key: string | null) => {
  if (key !== null) {
    directSetAttribute(el, 'q:key', key);
  }
};

export const resolveSlotProjection = (ctx: RenderStaticContext) => {
  // Slots removed
  const subsManager = ctx.$containerState$.$subsManager$;
  for (const slotEl of ctx.$rmSlots$) {
    const key = getKey(slotEl);
    assertDefined(key, 'slots must have a key');

    const slotChildren = getChildren(slotEl, 'root');
    if (slotChildren.length > 0) {
      const sref = slotEl.getAttribute(QSlotRef);
      const hostCtx = ctx.$roots$.find((r) => r.$id$ === sref);
      if (hostCtx) {
        const template = createTemplate(ctx.$doc$, key);
        const hostElm = hostCtx.$element$;
        for (const child of slotChildren) {
          directAppendChild(template, child);
        }
        directInsertBefore(hostElm, template, hostElm.firstChild);
      } else {
        // If slot content cannot be relocated, it means it's content is definively removed
        // Cleanup needs to be executed
        cleanupTree(slotEl, ctx, subsManager, false);
      }
    }
  }

  // Slots added
  for (const [slotEl, hostElm] of ctx.$addSlots$) {
    const key = getKey(slotEl);
    assertDefined(key, 'slots must have a key');

    const template = Array.from(hostElm.childNodes).find((node) => {
      return isSlotTemplate(node) && node.getAttribute(QSlot) === key;
    }) as Element | undefined;
    if (template) {
      const children = getChildren(template, 'root');
      children.forEach((child) => {
        directAppendChild(slotEl, child);
      });
      template.remove();
    }
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
