import { assertDefined } from '../assert/assert';
import { getPlatform } from '../platform/platform';
import type { HostElements } from './types';
import { AttributeMarker } from '../util/markers';
import { getQComponent } from '../component/q-component-ctx';

/**
 * Mark component for rendering.
 *
 * Use `notifyRender` method to mark a component for rendering at some later point in time.
 * This method uses `getPlatform(doc).queueRender` for scheduling of the rendering. The
 * default implementation of the method is to use `requestAnimationFrame` to do actual rendering.
 *
 * The method is intended to coalesce multiple calls into `notifyRender` into a single call for
 * rendering.
 *
 * @param hostElement - Host-element of the component to re-render.
 * @returns A promise which is resolved when the component has been rendered.
 * @public
 */
// TODO(misko): tests
// TODO(misko): this should take QComponent as well.
export function qNotifyRender(hostElement: Element): Promise<void> {
  assertDefined(hostElement.getAttribute(AttributeMarker.OnRender));
  hostElement.setAttribute(AttributeMarker.RenderNotify, '');
  return scheduleRender(hostElement.ownerDocument) as any;
}

/**
 * Schedule rendering for the future.
 *
 * Multiple calls to this function result in a single `rAF` scheduling creating coalescence.
 *
 * Rendering is achieved by `querySelectorAll` looking for all `on:q-render` attributes.
 *
 * @returns a `Promise` of all of the `HostElements` which were re-rendered.
 * @internal
 */
export function scheduleRender(doc: Document): Promise<HostElements> {
  return getPlatform(doc).queueRender(renderMarked);
}

async function renderMarked(doc: Document) {
  const hosts = Array.from(
    doc.querySelectorAll(AttributeMarker.RenderNotifySelector)
  ) as HostElements;
  return Promise.all(
    hosts.map((hostElement) => {
      hostElement.removeAttribute(AttributeMarker.RenderNotify);
      const cmp = getQComponent(hostElement);
      return cmp && cmp.render();
    })
  );
}
