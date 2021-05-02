/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { isElement } from '../../util/element.js';
import { assertString } from '../../assert/index.js';
import { Component, isComponent } from '../../component/component.js';
import { QError, qError } from '../../error/error.js';
import { QRL } from '../../import/qrl.js';
import { Props } from '../../injector/types.js';
import { isService, Service } from '../../service/service.js';
import { extractPropsFromElement } from '../../util/attributes.js';
import { AttributeMarker } from '../../util/markers.js';
import { flattenPromiseTree, isPromise } from '../../util/promises.js';
import { HostElements } from '../types.js';
import { jsxRenderComponent } from './render.js';

/**
 * Marks `Component` or `Service` dirty.
 *
 * # `Component`
 * Marking a `Component` dirty means that that component needs to be re-rendered.
 * Marking a `Component` dirty will add `on.render` attribute to each component which `markDirty`
 * is invoked on..
 *
 * # `Service`
 * Marking a `Service` dirty means that all `Component`s which depend on that specific instance
 * `ServiceKey` are also marked dirty. To get a list of `Component`s a `querySelectorAll` is used
 * to retrieve all `Components` which have `bind:service-key` attribute and subsequently mark them
 * with `on.render` attribute.
 *
 * This in effect propagates any changes to the service to all components which have the said
 * service as an input.
 *
 * # Reconciliation
 *
 * Marking a `Component` or `Service` dirty will schedule a `requestAnimationFrame` to reconcile
 * the `Component`s which are marked with `on.render` attribute. When `requestAnimationFrame` fires
 * a `querySelectorAll` is used to retrieve all components marked with `on.render` attribute and
 * `jsxRender` method is invoked on them, and `on.render` attribute cleared.
 *
 * @param componentServiceOrElement - `Component`, `Service` or `Element` instance to mark dirty.
 * @returns
 * @public
 */
export function markDirty(
  componentServiceOrElement: Component<any, any> | Service<any, any> | Element
): Promise<HostElements> {
  if (isService(componentServiceOrElement)) {
    return markServiceDirty(componentServiceOrElement);
  } else if (isComponent(componentServiceOrElement)) {
    return markComponentDirty(componentServiceOrElement);
  } else if (isElement(componentServiceOrElement)) {
    return markElementDirty(componentServiceOrElement);
  } else {
    throw qError(QError.Render_expectingServiceOrComponent_obj, componentServiceOrElement);
  }
}

/**
 * @internal
 */
export function markComponentDirty(component: Component<any, any>): Promise<HostElements> {
  return markElementDirty(component.$host);
}

/**
 * @internal
 */
export function markElementDirty(host: Element): Promise<HostElements> {
  const document = host.ownerDocument as QDocument;
  host.setAttribute(
    AttributeMarker.EventRender,
    host.getAttribute(AttributeMarker.ComponentTemplate)!
  );
  const promise = document.$qScheduledRender;
  if (isPromise(promise)) {
    return promise;
  }
  return scheduleRender(document);
}

/**
 * @internal
 */
export function markServiceDirty(service: Service<any, any>): Promise<HostElements> {
  const key = service.$key;
  const document = service.$element.ownerDocument as QDocument;
  let foundListener = false;
  document.querySelectorAll(toAttrQuery('bind:' + key)).forEach((componentElement: HTMLElement) => {
    const qrl = componentElement.getAttribute(AttributeMarker.ComponentTemplate)!;
    if (!qrl) {
      throw qError(QError.Render_bindNeedsComponent_key_element, key, componentElement);
    }
    foundListener = true;
    componentElement.setAttribute(AttributeMarker.EventRender, qrl);
  });

  return foundListener ? scheduleRender(document) : Promise.resolve([]);
}
function toAttrQuery(key: string): any {
  return '[' + key.replace(/[:.-_]/g, (v) => '\\' + v) + ']';
}

/**
 * Schedule rendering for the future.
 *
 * Multiple calls to this function result in a single `rAF` scheduling creating coalescence.
 *
 * Rendering is achieved by `querySelectorAll` looking for all `AttributeMarker.EventRenderSelector`.
 *
 * @returns a `Promise` of all of the components which were re-rendered.
 * @internal
 */
export function scheduleRender(document: QDocument): Promise<HostElements> {
  const promise = document.$qScheduledRender;
  if (promise) return promise;
  const requestAnimationFrame = document.defaultView!.requestAnimationFrame!;
  if (!requestAnimationFrame) {
    throw qError(QError.Render_noRAF);
  }
  return (document.$qScheduledRender = new Promise<HostElements>((resolve, reject) => {
    requestAnimationFrame(() => {
      const waitOn: HostElements = [];
      const componentHosts = document.querySelectorAll(AttributeMarker.EventRenderSelector);
      componentHosts.forEach((host) => {
        host.removeAttribute(AttributeMarker.EventRender);
        const qrl = (host.getAttribute(AttributeMarker.ComponentTemplate)! as any) as QRL;
        qDev && assertString(qrl);
        const props: Props = extractPropsFromElement(host);
        jsxRenderComponent(host, qrl, waitOn, props, document);
      });
      flattenPromiseTree(waitOn).then(() => {
        document.$qScheduledRender = null;
        resolve(componentHosts as any);
      }, reject);
    });
  }));
}

interface QDocument extends Document {
  $qScheduledRender?: Promise<HostElements> | null;
}
