import { isDocument } from '../util/element';
import { executeContext, printRenderStats, RenderContext } from './cursor';
import { isJSXNode, jsx, processNode } from './jsx/jsx-runtime';
import type { JSXNode, FunctionComponent } from './jsx/types/jsx-node';
import { visitJsxNode } from './render';
import { getRenderingState } from './notify-render';
import { getDocument } from '../util/dom';
import { qDev, qTest } from '../util/qdev';
import { version } from '../version';
import { QContainerAttr } from '../util/markers';
import { logError } from '../util/log';
import { isWatchDescriptor, runWatch, WatchDescriptor, WatchFlags } from '../watch/watch.public';
import { appendQwikDevTools, getContext } from '../props/props';

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
 * @alpha
 */
export async function render(
  parent: Element | Document,
  jsxNode: JSXNode<unknown> | FunctionComponent<any>
): Promise<RenderContext | undefined> {
  // If input is not JSX, convert it
  if (!isJSXNode(jsxNode)) {
    jsxNode = jsx(jsxNode, null);
  }
  const doc = getDocument(parent);
  const containerEl = getElement(parent);
  if (qDev && containerEl.hasAttribute('q:container')) {
    logError('You can render over a existing q:container. Skipping render().');
    return;
  }
  injectQContainer(containerEl);

  const ctx: RenderContext = {
    doc,
    globalState: getRenderingState(containerEl),
    hostElements: new Set(),
    operations: [],
    roots: [parent as Element],
    components: [],
    containerEl,
    perf: {
      visited: 0,
      timing: [],
    },
  };

  await visitJsxNode(ctx, parent as Element, processNode(jsxNode), false);

  executeContext(ctx);
  if (!qTest) {
    injectQwikSlotCSS(parent);
  }

  if (qDev) {
    appendQwikDevTools(containerEl);
    if (typeof window !== 'undefined' && window.document != null) {
      printRenderStats(ctx);
    }
  }
  const promises: Promise<WatchDescriptor>[] = [];
  ctx.hostElements.forEach((host) => {
    const elCtx = getContext(host);
    elCtx.refMap.array.filter(isWatchDescriptor).forEach((watch) => {
      if (watch.f & WatchFlags.IsDirty) {
        promises.push(runWatch(watch));
      }
    });
  });
  await Promise.all(promises);
  return ctx;
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

export function injectQContainer(containerEl: Element) {
  containerEl.setAttribute('q:version', version || '');
  containerEl.setAttribute(QContainerAttr, 'resumed');
}
