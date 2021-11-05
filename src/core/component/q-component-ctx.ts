import { assertDefined } from '../assert/assert';
import { cursorForComponent, cursorReconcileEnd } from '../render/cursor';
import type { OnHookReturn } from '../props/q-props';
import { ComponentRenderQueue, visitJsxNode } from '../render/q-render';
import { AttributeMarker } from '../util/markers';
import { flattenPromiseTree } from '../util/promises';
import { QrlStyles, styleContent, styleHost } from './qrl-styles';
import { _stateQObject } from '../object/q-object';
import { qProps } from '../props/q-props.public';

// TODO(misko): Can we get rid of this whole file, and instead teach qProps to know how to render
// the advantage will be that the render capability would then be exposed to the outside world as well.

export class QComponentCtx {
  __brand__!: 'QComponentCtx';
  hostElement: HTMLElement;

  readonly styleId: string | null = null;
  readonly styleClass: string | null = null;
  readonly styleHostClass: string | null = null;

  constructor(hostElement: HTMLElement) {
    this.hostElement = hostElement;
    const styleId = (this.styleId = hostElement.getAttribute(AttributeMarker.ComponentStyles));
    if (styleId) {
      this.styleHostClass = styleHost(styleId as any as QrlStyles<any>);
      this.styleClass = styleContent(styleId as any as QrlStyles<any>);
    }
  }

  dehydrate(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async render(): Promise<HTMLElement[]> {
    const props = qProps(this.hostElement) as any;
    // TODO(misko): extract constant
    if (props['state:'] == null) {
      try {
        const hook = props['on:qMount'];
        if (hook) {
          const values: OnHookReturn[] = await hook('qMount');
          values.forEach((v) => {
            props['state:' + v.state] = _stateQObject(v.value, v.state);
          });
        }
      } catch (e) {
        // TODO(misko): Proper error handling
        // eslint-disable-next-line no-console
        console.log(e);
      }
    }
    const onRender = props['on:qRender']; // TODO(misko): extract constant
    assertDefined(onRender);
    this.hostElement.removeAttribute(AttributeMarker.RenderNotify);
    const renderQueue: ComponentRenderQueue = [];
    try {
      const returnValue: OnHookReturn[] = await onRender('qRender');
      if (returnValue.length) {
        const jsxNode = returnValue[0].value;
        const cursor = cursorForComponent(this.hostElement);
        visitJsxNode(this, renderQueue, cursor, jsxNode);
        cursorReconcileEnd(cursor);
      }
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

/**
 *
 * @param node
 */
export function clearStateCache(node: Element | Document) {
  node.querySelectorAll(AttributeMarker.OnRenderSelector).forEach((comp) => {
    (comp as any)[COMPONENT_PROP] = null;
  });
}

//TODO(misko): needs lots of tests
// - Skip over projection
// TODO(misko): move to central DOM traversal location.
export function getHostElement(element: Element): HTMLElement | null {
  // TODO(misko): this needs to take projection into account.
  while (element && !element.getAttribute(AttributeMarker.OnRender)) {
    element = element.parentElement!;
  }
  return element as HTMLElement | null;
}
