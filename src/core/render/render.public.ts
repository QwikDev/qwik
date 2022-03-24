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
  const doc = isDocument(parent) ? parent : getDocument(parent);
  resumeIfNeeded(parent);

  const ctx: RenderContext = {
    doc,
    globalState: getRenderingState(doc),
    hostElements: new Set(),
    operations: [],
    roots: [parent as Element],
    component: undefined,
    perf: {
      visited: 0,
      timing: [],
    },
  };
  injectQVersion(parent);

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

export function injectQwikSlotCSS(parent: Document | Element) {
  const doc = isDocument(parent) ? parent : getDocument(parent);
  const element = isDocument(parent) ? parent.head : parent;
  const style = doc.createElement('style');
  style.setAttribute('id', 'qwik/base-styles');
  style.textContent = `q\\:slot{display:contents}q\\:fallback{display:none}q\\:fallback:last-child{display:contents}`;
  element.insertBefore(style, element.firstChild);
}

export function injectQVersion(parent: Document | Element) {
  const element = isDocument(parent) ? parent.documentElement : parent;
  element.setAttribute('q:version', version || '');
  element.setAttribute('q:container', '');
}
