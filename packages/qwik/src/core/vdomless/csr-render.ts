import type { RenderOptions, RenderResult } from '../client/types';
import { QContainerValue } from '../shared/types';
import { QContainerAttr } from '../shared/utils/markers';

export interface CsrRenderContext {
  document: Document;
}

export type CsrRenderRoot = (_props: undefined, ctx: CsrRenderContext) => readonly Node[] | void;

export const render = async (
  root: CsrRenderRoot,
  parent: Element | Document,
  _opts: RenderOptions = {}
): Promise<RenderResult> => {
  const target = getRenderTarget(parent);
  target.setAttribute(QContainerAttr, QContainerValue.RESUMED);

  const output = root(undefined, { document: target.ownerDocument });
  const nodes = output ?? [];
  for (let i = 0; i < nodes.length; i++) {
    target.appendChild(nodes[i]);
  }

  return {
    cleanup() {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.parentNode !== null) {
          node.parentNode.removeChild(node);
        }
      }
    },
  };
};

function getRenderTarget(parent: Element | Document): Element {
  if (parent.nodeType === 9) {
    return (parent as Document).body;
  }
  return parent as Element;
}
