import { isDocument } from '../../util/element';
import { executeDOMRender, printRenderStats } from './visitor';
import { isJSXNode, jsx } from '../jsx/jsx-runtime';
import type { JSXNode, FunctionComponent } from '../jsx/types/jsx-node';
import { visitJsxNode } from './visitor';
import { getDocument } from '../../util/dom';
import { qDev } from '../../util/qdev';
import { version } from '../../version';
import { QContainerAttr } from '../../util/markers';
import { appendQwikDevTools } from '../../props/props';
import { qError, QError_cannotRenderOverExistingContainer } from '../../error/error';
import { directSetAttribute } from '../fast-calls';
import { processData } from './render-dom';
import { ContainerState, getContainerState } from '../container';
import { postRendering } from './notify-render';
import { createRenderContext } from '../execute-component';

/**
 * @alpha
 */
export interface RenderOptions {
  envData?: Record<string, any>;
}

/**
 * Render JSX.
 *
 * Use this method to render JSX. This function does reconciling which means
 * it always tries to reuse what is already in the DOM (rather then destroy and
 * recreate content.)
 *
 * @param parent - Element which will act as a parent to `jsxNode`. When
 *     possible the rendering will try to reuse existing nodes.
 * @param jsxNode - JSX to render
 * @alpha
 */
export const render = async (
  parent: Element | Document,
  jsxNode: JSXNode<unknown> | FunctionComponent<any>,
  opts?: RenderOptions
): Promise<void> => {
  // If input is not JSX, convert it
  if (!isJSXNode(jsxNode)) {
    jsxNode = jsx(jsxNode, null);
  }
  const doc = getDocument(parent);
  const containerEl = getElement(parent);
  if (qDev && containerEl.hasAttribute(QContainerAttr)) {
    throw qError(QError_cannotRenderOverExistingContainer, containerEl);
  }
  injectQContainer(containerEl);

  const containerState = getContainerState(containerEl);
  const envData = opts?.envData;
  if (envData) {
    Object.assign(containerState.$envData$, envData);
  }
  containerState.$hostsRendering$ = new Set();
  containerState.$renderPromise$ = renderRoot(
    containerEl,
    jsxNode,
    doc,
    containerState,
    containerEl
  );

  const renderCtx = await containerState.$renderPromise$;
  await postRendering(containerState, renderCtx);
};

const renderRoot = async (
  parent: Element,
  jsxNode: JSXNode<unknown> | FunctionComponent<any>,
  doc: Document,
  containerState: ContainerState,
  containerEl: Element
) => {
  const ctx = createRenderContext(doc, containerState);
  ctx.$roots$.push(parent as Element);

  const processedNodes = await processData(jsxNode);
  await visitJsxNode(ctx, parent as Element, processedNodes, 0);

  ctx.$operations$.push(...ctx.$postOperations$);
  executeDOMRender(ctx);

  if (qDev) {
    appendQwikDevTools(containerEl);
    printRenderStats(ctx);
  }
  return ctx;
};

export const getElement = (docOrElm: Document | Element): Element => {
  return isDocument(docOrElm) ? docOrElm.documentElement : docOrElm;
};

export const injectQContainer = (containerEl: Element) => {
  directSetAttribute(containerEl, 'q:version', version ?? 'dev');
  directSetAttribute(containerEl, QContainerAttr, 'resumed');
  directSetAttribute(containerEl, 'q:render', qDev ? 'dom-dev' : 'dom');
};
