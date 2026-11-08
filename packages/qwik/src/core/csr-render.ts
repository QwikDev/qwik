import type { RenderOptions, RenderResult, RenderRoot } from './render-types';
import { QContainerValue } from './shared/types';
import { QContainerAttr } from './shared/utils/markers';
import { createContainerContext, type ContainerContext } from './runtime/container-context';
import { newInvokeContext } from './runtime/invoke-context';
import { disposeOwner } from './runtime/owner';
import { defaultScheduler, type Scheduler } from './runtime/scheduler';
import { toNodes } from './utils/nodes';
import type { MaybeNodeOutput, NodeOutput } from './utils/nodes';
import type { ValueOrPromise } from './shared/utils/types';
import { maybeThen } from './shared/utils/promises';
import { createComponent } from './component/component';

export type CsrRenderContext = ContainerContext;

/** A root returning `null` renders nothing, as a component returning nothing does. */
type ComponentRender<Props> = (
  props: Props,
  ctx: CsrRenderContext
) => ValueOrPromise<NodeOutput | void>;

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
    // the root renders as a component, so a read that throws a promise retries it
    const mounted = maybeThen(
      createComponent(root as ComponentRender<Props>, opts.props as Props, context, {
        invokeContext,
      }),
      (output) => {
        const nodes = toNodes(output as MaybeNodeOutput);
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
