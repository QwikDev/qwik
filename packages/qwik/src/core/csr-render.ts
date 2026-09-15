import type { RenderOptions, RenderResult, RenderRoot } from './render-types';
import { QContainerValue } from './shared/types';
import { QContainerAttr } from './shared/utils/markers';
import { createContainerContext, type ContainerContext } from './runtime/container-context';
import { invoke, newInvokeContext } from './runtime/invoke-context';
import { disposeOwner } from './runtime/owner';
import { defaultScheduler, type Scheduler } from './runtime/scheduler';
import { toNodes } from './utils/nodes';
import type { MaybeNodeOutput } from './utils/nodes';
import type { ValueOrPromise } from './shared/utils/types';
import { maybeThen } from './shared/utils/promises';
import { applyUseOnToCsrOutput } from './runtime/use-on';

export type CsrRenderContext = ContainerContext;

export type CsrRenderRoot<Props = undefined> = (
  props: Props,
  ctx: CsrRenderContext
) => ValueOrPromise<MaybeNodeOutput>;

export type Render = <Props = undefined>(
  parent: Element | Document,
  root: RenderRoot<Props>,
  opts?: RenderOptions<Props>
) => Promise<RenderResult>;

export const renderCompiled = <Props = undefined>(
  parent: Element | Document,
  root: CsrRenderRoot<Props>,
  opts: RenderOptions<Props> & { scheduler?: Scheduler } = {}
): Promise<RenderResult> => {
  const target = getRenderTarget(parent);
  const scheduler = opts.scheduler ?? defaultScheduler;
  target.setAttribute(QContainerAttr, QContainerValue.RESUMED);
  const context = createContainerContext(target, scheduler, opts.serverData);

  const invokeContext = newInvokeContext({ container: context });
  // Mounted nodes may be swapped in place later (an async slot), so track the boundary, not them.
  let mountedAfter: Node | null | undefined;
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    if (invokeContext.owner !== null) {
      disposeOwner(invokeContext.owner);
      invokeContext.owner = null;
    }
    if (mountedAfter !== undefined) {
      while (target.lastChild !== mountedAfter) {
        target.lastChild!.remove();
      }
      mountedAfter = undefined;
    }
  };

  let rendering: ValueOrPromise<void>;
  try {
    const mounted = maybeThen(
      invoke(invokeContext, root, opts.props as Props, context),
      (value) => {
        let output = value;
        if (invokeContext.useOnEvents !== undefined) {
          output = applyUseOnToCsrOutput(output, invokeContext.useOnEvents, context.document);
        }
        const nodes = toNodes(output);
        if (nodes.length > 0) {
          mountedAfter = target.lastChild;
          for (let i = 0; i < nodes.length; i++) {
            target.appendChild(nodes[i]);
          }
        }
      }
    );
    scheduler.waitFor(mounted);
    rendering = maybeThen(mounted, () => scheduler.flushInteraction());
  } catch (error) {
    cleanup();
    return Promise.reject(error);
  }

  return Promise.resolve(rendering).then(
    () => ({ cleanup }),
    (error) => {
      cleanup();
      throw error;
    }
  );
};

/** @public */
export const render = renderCompiled as Render;

function getRenderTarget(parent: Element | Document): Element {
  if (parent.nodeType === 9) {
    return (parent as Document).body;
  }
  return parent as Element;
}
