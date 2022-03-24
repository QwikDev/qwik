import { isDocument } from '../util/element';
import { executeContext, printRenderStats, RenderContext } from './cursor';
import { isJSXNode, jsx, processNode } from './jsx/jsx-runtime';
import type { JSXNode, FunctionComponent } from './jsx/types/jsx-node';
import { visitJsxNode } from './render';
import type { ValueOrPromise } from '../util/types';
import { then } from '../util/promises';
import { getRenderingState } from './notify-render';
import { getDocument } from '../util/dom';
import { qDev, qTest } from '../util/qdev';
import { resumeIfNeeded } from '../props/props';
import { version } from '../version';
import { QContainerAttr } from '../util/markers';

/**
 * Render JSX.
 *
 * Use this method to render JSX. This function does reconciling which means
 * it always tries to reuse what is already in the DOM (rather then destroy and
 * recrate content.)
 *
 * @param parent - Element which will act as a parent to `jsxNode`. When
 *     possible the rendering will try to reuse existing nodes.
 * @param jsxNode - JSX to render
 * @public
 */
export function render(
  parent: Element | Document,
  jsxNode: JSXNode<unknown> | FunctionComponent<any>
): ValueOrPromise<RenderContext> {
  // If input is not JSX, convert it
  if (!isJSXNode(jsxNode)) {
    jsxNode = jsx(jsxNode, null);
  }
  const doc = getDocument(parent);
  const containerEl = getElement(parent);
  resumeIfNeeded(containerEl);
  injectQVersion(containerEl);

  const ctx: RenderContext = {
    doc,
    globalState: getRenderingState(containerEl),
    hostElements: new Set(),
    operations: [],
    roots: [parent as Element],
    component: undefined,
    containerEl,
    perf: {
      visited: 0,
      timing: [],
    },
  };

  return then(visitJsxNode(ctx, parent as Element, processNode(jsxNode), false), () => {
    executeContext(ctx);
    if (!qTest) {
      injectQwikSlotCSS(parent);
    }

    if (qDev) {
      if (typeof window !== 'undefined' && window.document != null) {
        printRenderStats(ctx);
      }
    }
    return ctx;
  });
}

export function injectQwikSlotCSS(docOrElm: Document | Element) {
  const doc = getDocument(docOrElm);
  const element = isDocument(docOrElm) ? docOrElm.head : docOrElm;
  const style = doc.createElement('style');
  style.setAttribute('id', 'qwik/base-styles');
  style.textContent = `q\\:slot{display:contents}q\\:fallback{display:none}q\\:fallback:last-child{display:contents}`;
  element.insertBefore(style, element.firstChild);
}

export function getElement(docOrElm: Document | Element): Element {
  return isDocument(docOrElm) ? docOrElm.documentElement : docOrElm;
}

export function injectQVersion(containerEl: Element) {
  containerEl.setAttribute('q:version', version || '');
  containerEl.setAttribute(QContainerAttr, '');
}
