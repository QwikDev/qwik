import { assertDefined } from '../assert/assert';
import { cursorForComponent, cursorReconcileEnd } from '../render/cursor';
import { ComponentRenderQueue, visitJsxNode } from '../render/render';
import { ComponentScopedStyles, OnRenderProp } from '../util/markers';
import { flattenPromiseTree, then } from '../util/promises';
import { styleContent, styleHost } from './qrl-styles';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { getContext, getEvent, QContext } from '../props/props';

// TODO(misko): Can we get rid of this whole file, and instead teach getProps to know how to render
// the advantage will be that the render capability would then be exposed to the outside world as well.

export class QComponentCtx {
  __brand__!: 'QComponentCtx';
  ctx: QContext;
  hostElement: HTMLElement;

  styleId: string | undefined | null = undefined;
  styleClass: string | null = null;
  styleHostClass: string | null = null;

  constructor(hostElement: HTMLElement) {
    this.hostElement = hostElement;
    this.ctx = getContext(hostElement);
  }

  async render(): Promise<HTMLElement[]> {
    const hostElement = this.hostElement;
    const onRender = getEvent(this.ctx, OnRenderProp) as any as () => void;
    assertDefined(onRender);
    const renderQueue: ComponentRenderQueue = [];
    try {
      const event = 'qRender';
      const promise = useInvoke(newInvokeContext(hostElement, hostElement, event), onRender);
      await then(promise, (jsxNode) => {
        if (this.styleId === undefined) {
          const scopedStyleId = (this.styleId = hostElement.getAttribute(ComponentScopedStyles));
          if (scopedStyleId) {
            this.styleHostClass = styleHost(scopedStyleId);
            this.styleClass = styleContent(scopedStyleId);
          }
        }
        const cursor = cursorForComponent(this.hostElement);
        visitJsxNode(this, renderQueue, cursor, jsxNode, false);
        cursorReconcileEnd(cursor);
      });
    } catch (e) {
      // TODO(misko): Proper error handling
      // eslint-disable-next-line no-console
      console.log(e);
    }
    return [this.hostElement, ...(await flattenPromiseTree<HTMLElement>(renderQueue))];
  }
}

const COMPONENT_PROP = '__qComponent__';

export function getQComponent(hostElement: Element): QComponentCtx | undefined {
  const element = hostElement as { [COMPONENT_PROP]?: QComponentCtx };
  let component = element[COMPONENT_PROP];
  if (!component)
    component = element[COMPONENT_PROP] = new QComponentCtx(hostElement as HTMLElement) as any;
  return component;
}
