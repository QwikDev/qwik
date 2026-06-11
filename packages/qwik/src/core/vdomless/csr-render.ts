import type { RenderOptions, RenderResult } from '../client/types';
import { QContainerValue } from '../shared/types';
import { QContainerAttr } from '../shared/utils/markers';
import { createContainerContext, type ContainerContext } from './runtime/container-context';
import { invoke, newInvokeContext } from './runtime/invoke-context';
import { defaultScheduler, type Scheduler } from './runtime/scheduler';

export type CsrRenderContext = ContainerContext;

export type CsrRenderRoot = (_props: undefined, ctx: CsrRenderContext) => readonly Node[] | void;

export const render = async (
  root: CsrRenderRoot,
  parent: Element | Document,
  opts: RenderOptions & { scheduler?: Scheduler } = {}
): Promise<RenderResult> => {
  const target = getRenderTarget(parent);
  const scheduler = opts.scheduler ?? defaultScheduler;
  target.setAttribute(QContainerAttr, QContainerValue.RESUMED);
  const context = createContainerContext(target, scheduler);

  const output = invoke(newInvokeContext(), root, undefined, context);
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
