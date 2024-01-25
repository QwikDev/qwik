import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { isElement } from 'packages/qwik/src/testing/html';
import type { RenderOptions, RenderResult } from '../../render/dom/render.public';
import type { JSXOutput } from '../../render/jsx/types/jsx-node';
import { isDocument } from '../../util/element';
import { QContainerAttr } from '../../util/markers';
import { DomContainer, getDomContainer } from './dom-container';
import { vnode_applyJournal, vnode_diff } from './vnode-diff';

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
  jsxNode: JSXOutput,
  opts?: RenderOptions
): Promise<RenderResult> => {
  if (isDocument(parent)) {
    let child = parent.firstChild;
    while (child && !isElement(child)) {
      child = child.nextSibling;
    }
    parent = child!;
  }
  parent.setAttribute(QContainerAttr, 'resumed');

  const container = getDomContainer(parent as HTMLElement) as DomContainer;
  await vnode_diff(container, jsxNode as JSXNode, container.rootVNode);
  vnode_applyJournal(container.$journal$);
  container.$journal$.length = 0;

  return {
    cleanup: () => {
      throw new Error('IMPLEMENT');
    },
  };
};
