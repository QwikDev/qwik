import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import type { RenderOptions, RenderResult } from '../../render/dom/render.public';
import type { FunctionComponent, JSXOutput } from '../../render/jsx/types/jsx-node';
import { isDocument, isElement } from '../../util/element';
import { QContainerAttr } from '../../util/markers';
import { DomContainer, getDomContainer } from './dom-container';
import { releaseSubscriptions, vnode_diff } from './vnode-diff';
import { vnode_applyJournal } from './vnode';

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
export const render2 = async (
  parent: Element | Document,
  jsxNode: JSXOutput | FunctionComponent<any>,
  opts: RenderOptions = {}
): Promise<RenderResult> => {
  opts = {
    serverData: {},
    ...opts,
  };
  if (isDocument(parent)) {
    let child: Node | null = parent.firstChild;
    while (child && !isElement(child)) {
      child = child.nextSibling;
    }
    parent = child as Element;
  }
  (parent as Element).setAttribute(QContainerAttr, 'resumed');

  const container = getDomContainer(parent as HTMLElement) as DomContainer;
  container.$serverData$ = opts.serverData!;
  await vnode_diff(container, jsxNode as JSXNode, container.rootVNode);
  await container.$scheduler$.$drainAll$();

  return {
    cleanup: () => {
      releaseSubscriptions(container, container.rootVNode);
    },
  };
};
