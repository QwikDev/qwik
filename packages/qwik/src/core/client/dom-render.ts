import type { FunctionComponent, JSXNode, JSXOutput } from '../shared/jsx/types/jsx-node';
import { isDocument, isElement } from '../shared/utils/element';
import { ChoreType } from '../shared/util-chore-type';
import { QContainerValue } from '../shared/types';
import { DomContainer, getDomContainer } from './dom-container';
import { cleanup } from './vnode-diff';
import { QContainerAttr } from '../shared/utils/markers';
import type { RenderOptions, RenderResult } from './types';
import { qDev } from '../shared/utils/qdev';
import { QError, qError } from '../shared/error/error';

/**
 * Render JSX.
 *
 * Use this method to render JSX. This function does reconciling which means it always tries to
 * reuse what is already in the DOM (rather then destroy and recreate content.) It returns a cleanup
 * function you could use for cleaning up subscriptions.
 *
 * @param parent - Element which will act as a parent to `jsxNode`. When possible the rendering will
 *   try to reuse existing nodes.
 * @param jsxNode - JSX to render
 * @returns An object containing a cleanup function.
 * @public
 */
export const render = async (
  parent: Element | Document,
  jsxNode: JSXOutput | FunctionComponent<any>,
  opts: RenderOptions = {}
): Promise<RenderResult> => {
  if (isDocument(parent)) {
    let child: Node | null = parent.firstChild;
    while (child && !isElement(child)) {
      child = child.nextSibling;
    }
    parent = child as Element;
  }
  if (qDev && parent.hasAttribute(QContainerAttr)) {
    throw qError(QError.cannotRenderOverExistingContainer, [parent]);
  }
  (parent as Element).setAttribute(QContainerAttr, QContainerValue.RESUMED);

  const container = getDomContainer(parent as HTMLElement) as DomContainer;
  container.$serverData$ = opts.serverData || {};
  const host = container.rootVNode;
  container.$scheduler$(ChoreType.NODE_DIFF, host, host, jsxNode as JSXNode);
  await container.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
  return {
    cleanup: () => {
      cleanup(container, container.rootVNode);
    },
  };
};
