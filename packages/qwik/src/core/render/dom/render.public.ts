import { isDocument } from '../../util/element';
import { jsx } from '../jsx/jsx-runtime';
import type { JSXOutput, FunctionComponent } from '../jsx/types/jsx-node';
import { cleanupTree, domToVnode, smartUpdateChildren } from './visitor';
import { getDocument } from '../../util/dom';
import { qDev } from '../../util/qdev';
import { version } from '../../version';
import { QContainerAttr } from '../../util/markers';
import { qError, QError_cannotRenderOverExistingContainer } from '../../error/error';
import { directRemoveAttribute, directSetAttribute } from '../fast-calls';
import { processData, wrapJSX } from './render-dom';
import {
  type ContainerState,
  removeContainerState,
  _getContainerState,
} from '../../container/container';
import { postRendering } from './notify-render';
import { createRenderContext } from '../execute-component';
import { executeDOMRender, printRenderStats } from './operations';
import { logError } from '../../util/log';
import { appendQwikDevTools } from '../../container/resume';
import type { RenderContext } from '../types';

/** @public */
export interface RenderOptions {
  serverData?: Record<string, any>;
}

/** @public */
export interface RenderResult {
  cleanup(): void;
}

/**
 * Render JSX.
 *
 * Use this method to render JSX. This function does reconciling which means it always tries to
 * reuse what is already in the DOM (rather then destroy and recreate content.) It returns a cleanup
 * function you could use for cleaning up subscriptions.
 *
 * @param parent - Element which will act as a parent to `jsxNode`. When possible the rendering will
 *   try to reuse existing nodes.
 * @param jsxOutput - JSX to render
 * @returns An object containing a cleanup function.
 * @public
 */
export const render = async (
  parent: Element | Document,
  jsxOutput: JSXOutput | FunctionComponent<any>,
  opts?: RenderOptions
): Promise<RenderResult> => {
  // If input is a component, convert it
  if (typeof jsxOutput === 'function') {
    jsxOutput = jsx(jsxOutput, null);
  }
  const doc = getDocument(parent);
  const containerEl = getElement(parent);
  if (qDev && containerEl.hasAttribute(QContainerAttr)) {
    throw qError(QError_cannotRenderOverExistingContainer, containerEl);
  }
  // if (qDev) {
  //   if (parent.childNodes.length > 0) {
  //     throw new Error('Container must be empty before mounting anything inside');
  //   }
  // }
  injectQContainer(containerEl);

  const containerState = _getContainerState(containerEl);
  const serverData = opts?.serverData;
  if (serverData) {
    Object.assign(containerState.$serverData$, serverData);
  }
  const rCtx = createRenderContext(doc, containerState);
  containerState.$hostsRendering$ = new Set();
  containerState.$styleMoved$ = true;
  await renderRoot(rCtx, containerEl, jsxOutput, doc, containerState, containerEl);

  await postRendering(containerState, rCtx);

  return {
    cleanup() {
      cleanupContainer(rCtx, containerEl);
    },
  };
};

const renderRoot = async (
  rCtx: RenderContext,
  parent: Element,
  jsxOutput: JSXOutput,
  doc: Document,
  containerState: ContainerState,
  containerEl: Element
) => {
  const staticCtx = rCtx.$static$;

  try {
    const processedNodes = await processData(jsxOutput);
    // const rootJsx = getVdom(parent);
    const rootJsx = domToVnode(parent);
    await smartUpdateChildren(rCtx, rootJsx, wrapJSX(parent, processedNodes), 0);
  } catch (err) {
    logError(err);
  }

  staticCtx.$operations$.push(...staticCtx.$postOperations$);
  executeDOMRender(staticCtx);

  if (qDev) {
    appendQwikDevTools(containerEl);
  }
  printRenderStats(staticCtx);
};

export const getElement = (docOrElm: Document | Element): Element => {
  return isDocument(docOrElm) ? docOrElm.documentElement : docOrElm;
};

export const injectQContainer = (containerEl: Element) => {
  directSetAttribute(containerEl, 'q:version', version ?? 'dev');
  directSetAttribute(containerEl, QContainerAttr, 'resumed');
  directSetAttribute(containerEl, 'q:render', qDev ? 'dom-dev' : 'dom');
};

function cleanupContainer(renderCtx: RenderContext, container: Element) {
  const subsManager = renderCtx.$static$.$containerState$.$subsManager$;
  cleanupTree(container, renderCtx.$static$, subsManager, true);

  removeContainerState(container);

  // Clean up attributes
  directRemoveAttribute(container, 'q:version');
  directRemoveAttribute(container, QContainerAttr);
  directRemoveAttribute(container, 'q:render');

  // Remove children
  container.replaceChildren();
}
