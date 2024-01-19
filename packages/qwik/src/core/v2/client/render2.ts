import type { FunctionComponent, JSXNode } from '@builder.io/qwik/jsx-runtime';
import type { RenderOptions, RenderResult } from '../../render/dom/render.public';
import { vnode_applyJournal, vnode_diff } from './vnode-diff';
import { getDomContainer } from './dom-container';
import { isDocument } from '../../util/element';
import { isElement } from 'packages/qwik/src/testing/html';
import { QContainerAttr } from '../../util/markers';

export const render2 = async (
  parent: Element | Document,
  jsxNode: JSXNode | FunctionComponent<any>,
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

  const container = getDomContainer(parent as HTMLElement);
  await vnode_diff(container, jsxNode as JSXNode, container.rootVNode);
  vnode_applyJournal(container.$journal$);
  container.$journal$.length = 0;

  return {
    cleanup: () => {
      throw new Error('IMPLEMENT');
    },
  };
};
