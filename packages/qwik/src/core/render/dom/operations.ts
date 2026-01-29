import type { ContainerState } from '../../container/container';
import { assertDefined } from '../../error/assert';
import { codeToText, QError_setProperty } from '../../error/error';
import type { StyleAppend } from '../../use/use-core';
import { getDocument } from '../../util/dom';
import { isElement, isNode, isQwikElement } from '../../util/element';
import { logDebug, logError, logWarn } from '../../util/log';
import { QSlot, QSlotRef, QStyle } from '../../util/markers';
import { qDev } from '../../util/qdev';
import { directGetAttribute, directSetAttribute } from '../fast-calls';
import type { RenderStaticContext } from '../types';
import type { QwikElement, VirtualElement } from './virtual-element';
import {
  cleanupTree,
  directAppendChild,
  directInsertAfter,
  directInsertBefore,
  directRemoveChild,
  getChildren,
  isChildComponent,
  isSlotTemplate,
  SVG_NS,
} from './visitor';

export const setAttribute = (
  staticCtx: RenderStaticContext,
  el: QwikElement,
  prop: string,
  value: any
) => {
  staticCtx.$operations$.push({
    $operation$: _setAttribute,
    $args$: [el, prop, value],
  });
};

const _setAttribute = (el: QwikElement, prop: string, value: any) => {
  if (value == null || value === false) {
    el.removeAttribute(prop);
  } else {
    // element.setAttribute requires string. Boolean attributes automatically convert "" to `true`
    const str = value === true ? '' : String(value);
    directSetAttribute(el, prop, str);
  }
};

export const setProperty = (staticCtx: RenderStaticContext, node: any, key: string, value: any) => {
  staticCtx.$operations$.push({
    $operation$: _setProperty,
    $args$: [node, key, value],
  });
};

export const setPropertyPost = (
  staticCtx: RenderStaticContext,
  node: any,
  key: string,
  value: any
) => {
  staticCtx.$postOperations$.push({
    $operation$: _setProperty,
    $args$: [node, key, value],
  });
};

const _setProperty = (node: any, key: string, value: any) => {
  try {
    node[key] = value == null ? '' : value;
    if (value == null && isNode(node) && isElement(node)) {
      node.removeAttribute(key);
    }
  } catch (err) {
    logError(codeToText(QError_setProperty), key, { node, value }, err);
  }
};

export const createElement = (doc: Document, expectTag: string, isSvg: boolean): Element => {
  const el = isSvg ? doc.createElementNS(SVG_NS, expectTag) : doc.createElement(expectTag);

  return el;
};

export const insertBefore = <T extends Node | VirtualElement>(
  staticCtx: RenderStaticContext,
  parent: QwikElement,
  newChild: T,
  refChild: Node | VirtualElement | null | undefined
): T => {
  staticCtx.$operations$.push({
    $operation$: directInsertBefore,
    $args$: [parent, newChild, refChild ? refChild : null],
  });
  return newChild;
};

export const insertAfter = <T extends Node | VirtualElement>(
  staticCtx: RenderStaticContext,
  parent: QwikElement,
  newChild: T,
  refChild: Node | VirtualElement | null | undefined
): T => {
  staticCtx.$operations$.push({
    $operation$: directInsertAfter,
    $args$: [parent, newChild, refChild ? refChild : null],
  });
  return newChild;
};

export const appendChild = <T extends Node | VirtualElement>(
  staticCtx: RenderStaticContext,
  parent: QwikElement,
  newChild: T
): T => {
  staticCtx.$operations$.push({
    $operation$: directAppendChild,
    $args$: [parent, newChild],
  });
  return newChild;
};

export const appendHeadStyle = (staticCtx: RenderStaticContext, styleTask: StyleAppend) => {
  staticCtx.$containerState$.$styleIds$.add(styleTask.styleId);
  staticCtx.$postOperations$.push({
    $operation$: _appendHeadStyle,
    $args$: [staticCtx.$containerState$, styleTask],
  });
};

export const setClasslist = (
  staticCtx: RenderStaticContext,
  elm: Element,
  toRemove: string[],
  toAdd: string[]
) => {
  staticCtx.$operations$.push({
    $operation$: _setClasslist,
    $args$: [elm, toRemove, toAdd],
  });
};

export const _setClasslist = (elm: Element, toRemove: string[], toAdd: string[]) => {
  const classList = elm.classList;
  classList.remove(...toRemove);
  classList.add(...toAdd);
};

export const _appendHeadStyle = (containerState: ContainerState, styleTask: StyleAppend) => {
  const containerEl = containerState.$containerEl$;
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

export const prepend = (staticCtx: RenderStaticContext, parent: QwikElement, newChild: Node) => {
  staticCtx.$operations$.push({
    $operation$: directPrepend,
    $args$: [parent, newChild],
  });
};

export const directPrepend = (parent: QwikElement, newChild: Node) => {
  directInsertBefore(parent, newChild, parent.firstChild);
};

export const removeNode = (staticCtx: RenderStaticContext, el: Node | VirtualElement) => {
  if (isQwikElement(el)) {
    const subsManager = staticCtx.$containerState$.$subsManager$;
    cleanupTree(el as Element, staticCtx, subsManager, true);
  }
  staticCtx.$operations$.push({
    $operation$: _removeNode,
    $args$: [el, staticCtx],
  });
};

const _removeNode = (el: Node | VirtualElement, staticCtx: RenderStaticContext) => {
  const parent = el.parentElement;
  if (parent) {
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

export const executeDOMRender = (staticCtx: RenderStaticContext) => {
  for (const op of staticCtx.$operations$) {
    // PERF(misko): polymorphic execution
    op.$operation$.apply(undefined, op.$args$);
  }
  resolveSlotProjection(staticCtx);
};

export const getKey = (el: QwikElement): string | null => {
  return directGetAttribute(el, 'q:key');
};

export const setKey = (el: QwikElement, key: string | null) => {
  if (key !== null) {
    directSetAttribute(el, 'q:key', key);
  }
};

export const resolveSlotProjection = (staticCtx: RenderStaticContext) => {
  // Slots removed
  const subsManager = staticCtx.$containerState$.$subsManager$;
  for (const slotEl of staticCtx.$rmSlots$) {
    const key = getKey(slotEl);
    assertDefined(key, 'slots must have a key');

    const slotChildren = getChildren(slotEl, isChildComponent);
    if (slotChildren.length > 0) {
      const sref = slotEl.getAttribute(QSlotRef);
      const hostCtx = staticCtx.$roots$.find((r) => r.$id$ === sref);
      if (hostCtx) {
        const hostElm = hostCtx.$element$;
        if (hostElm.isConnected) {
          const hasTemplate = getChildren(hostElm, isSlotTemplate).some(
            (node: any) => directGetAttribute(node, QSlot) === key
          );

          if (!hasTemplate) {
            const template = createTemplate(staticCtx.$doc$, key);
            for (const child of slotChildren) {
              directAppendChild(template, child);
            }
            directInsertBefore(hostElm, template, hostElm.firstChild);
          } else {
            cleanupTree(slotEl, staticCtx, subsManager, false);
          }
        } else {
          cleanupTree(slotEl, staticCtx, subsManager, false);
        }
      } else {
        // If slot content cannot be relocated, it means it's content is definitely removed
        // Cleanup needs to be executed
        cleanupTree(slotEl, staticCtx, subsManager, false);
      }
    }
  }

  // Slots added
  for (const [slotEl, hostElm] of staticCtx.$addSlots$) {
    const key = getKey(slotEl);
    assertDefined(key, 'slots must have a key');

    const template = getChildren(hostElm, isSlotTemplate).find((node: any) => {
      return node.getAttribute(QSlot) === key;
    }) as Element | undefined;
    if (template) {
      getChildren(template, isChildComponent).forEach((child) => {
        directAppendChild(slotEl, child);
      });
      template.remove();
    }
  }
};

export const printRenderStats = (staticCtx: RenderStaticContext) => {
  if (qDev) {
    if (typeof window !== 'undefined' && window.document != null) {
      const byOp: Record<string, number> = {};
      for (const op of staticCtx.$operations$) {
        byOp[op.$operation$.name] = (byOp[op.$operation$.name] ?? 0) + 1;
      }
      const stats = {
        byOp,
        roots: staticCtx.$roots$.map((ctx) => ctx.$element$),
        hostElements: Array.from(staticCtx.$hostElements$),
        operations: staticCtx.$operations$.map((v) => [v.$operation$.name, ...v.$args$]),
      };
      const noOps = staticCtx.$operations$.length === 0;
      logDebug('Render stats.', noOps ? 'No operations' : '', stats);
    }
  }
};
