/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { isElement } from '../../util/element.js';
import { assertString } from '../../assert/index.js';
import { Component, isComponent } from '../../component/component.js';
import { QError, qError } from '../../error/error.js';
import type { QRL } from '../../import/qrl.js';
import type { Props } from '../../injector/types.js';
import { isEntity, Entity } from '../../entity/entity.js';
import { extractPropsFromElement } from '../../util/attributes.js';
import { AttributeMarker } from '../../util/markers.js';
import { flattenPromiseTree, isPromise } from '../../util/promises.js';
import type { HostElements } from '../types.js';
import { jsxRenderComponent } from './render.js';

/**
 * Marks `Component` or `Entity` dirty.
 *
 * # `Component`
 *
 * Marking a `Component` dirty means that the component needs to be re-rendered.
 *
 * Marking a `Component` dirty will add `on:q-render` attribute to each component which `markDirty`
 * is invoked on..
 *
 * # `Entity`
 *
 * Marking a `Entity` dirty means that all `Component`s which depend on the instance of the `Entity`
 * identified by its `EntityKey` are also marked dirty.
 *
 * To get a list of `Component`s a `querySelectorAll` is used to retrieve all `Components` which have
 * `bind:entity-key` attribute and subsequently mark them with an `on:q-render` attribute.
 *
 * This in effect propagates any changes to the service to all components which depend upon the
 * service as an input.
 *
 * # Reconciliation
 *
 * Marking a `Component` or `Entity` dirty will schedule a `requestAnimationFrame` to reconcile
 * the `Component`s which are marked with `on:q-render` attribute. When `requestAnimationFrame` fires
 * a `querySelectorAll` is used to retrieve all components marked with `on:q-render` attribute.
 * The `jsxRender` method is invoked on them, and the `on:q-render` attribute cleared.
 *
 * @param componentEntityOrElement - `Component`, `Entity` or `Element` instance to mark dirty.
 * @returns a `Promise` of all of the `HostElements` which were re-rendered.
 * @public
 */
export function markDirty(
  componentEntityOrElement: Component<any, any> | Entity<any, any> | Element
): Promise<HostElements> {
  if (isEntity(componentEntityOrElement)) {
    return markEntityDirty(componentEntityOrElement);
  } else if (isComponent(componentEntityOrElement)) {
    return markComponentDirty(componentEntityOrElement);
  } else if (isElement(componentEntityOrElement)) {
    return markElementDirty(componentEntityOrElement);
  } else {
    throw qError(QError.Render_expectingEntityOrComponent_obj, componentEntityOrElement);
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
  const doc = host.ownerDocument as QDocument;
  const promise = doc[ScheduledRender];

  host.setAttribute(
    AttributeMarker.EventRender,
    host.getAttribute(AttributeMarker.ComponentTemplate)!
  );

  if (isPromise(promise)) {
    return promise;
  } else {
    return scheduleRender(doc);
  }
}

/**
 * @internal
 */
export function markEntityDirty(entity: Entity<any, any>): Promise<HostElements> {
  const key = entity.$key;
  const doc = entity.$element.ownerDocument as QDocument;
  let foundListener = false;
  doc
    .querySelectorAll(toAttrQuery(AttributeMarker.BindPrefix + key))
    .forEach((componentElement: HTMLElement) => {
      const qrl = componentElement.getAttribute(AttributeMarker.ComponentTemplate)!;
      if (!qrl) {
        throw qError(QError.Render_bindNeedsComponent_key_element, key, componentElement);
      }
      foundListener = true;
      componentElement.setAttribute(AttributeMarker.EventRender, qrl);
    });

  return foundListener ? scheduleRender(doc) : Promise.resolve([]);
}
/**
 * Convert the key to an attribute query that can be used in `querySelectorAll()`.
 * @internal
 */
export function toAttrQuery(key: string): any {
  return '[' + key.replace(/[:.\-_]/g, (v) => '\\' + v) + ']';
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
export function scheduleRender(doc: QDocument): Promise<HostElements> {
  const promise = doc[ScheduledRender];
  if (promise) return promise;

  const requestAnimationFrame = doc.defaultView!.requestAnimationFrame!;
  if (!requestAnimationFrame) {
    throw qError(QError.Render_noRAF);
  }

  return (doc[ScheduledRender] = new Promise<HostElements>((resolve, reject) =>
    requestAnimationFrame(() => {
      doc[ScheduledRender] = null;

      const waitOn: HostElements = [];
      const componentHosts = doc.querySelectorAll(AttributeMarker.EventRenderSelector);
      const hosts: HostElements = [];
      componentHosts.forEach((host) => {
        host.removeAttribute(AttributeMarker.EventRender);
        const qrl = host.getAttribute(AttributeMarker.ComponentTemplate)! as any as QRL;
        qDev && assertString(qrl);
        const props: Props = extractPropsFromElement(host);
        jsxRenderComponent(host, qrl, waitOn, props);
        hosts.push(host);
      });

      flattenPromiseTree(waitOn).then(() => resolve(hosts), reject);
    })
  ));
}

const ScheduledRender = /*@__PURE__*/ Symbol();

interface QDocument extends Document {
  [ScheduledRender]?: Promise<HostElements> | null;
}
