/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { isElement } from '../../util/element';
import { assertString } from '../../assert/index';
import { Component, isComponent } from '../../component/component';
import { QError, qError } from '../../error/error';
import type { QRL } from '../../import/qrl';
import type { Props } from '../../injector/types';
import { isEntity, Entity } from '../../entity/entity';
import { extractPropsFromElement } from '../../util/attributes';
import { AttributeMarker } from '../../util/markers';
import { flattenPromiseTree } from '../../util/promises';
import type { HostElements } from '../types';
import { jsxRenderComponent } from './render';
import { getPlatform } from '../../platform/platform';

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
  host.setAttribute(
    AttributeMarker.EventRender,
    host.getAttribute(AttributeMarker.ComponentTemplate)!
  );
  return scheduleRender(host.ownerDocument);
}

/**
 * @internal
 */
export function markEntityDirty(entity: Entity<any, any>): Promise<HostElements> {
  const key = entity.$key;
  const doc = entity.$element.ownerDocument;
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
export function scheduleRender(doc: Document): Promise<HostElements> {
  return getPlatform(doc).queueRender(renderMarked);
}

async function renderMarked(doc: Document) {
  const waitOn: HostElements = [];
  const hosts = Array.from(
    doc.querySelectorAll(AttributeMarker.EventRenderSelector)
  ) as HostElements;

  for (const host of hosts) {
    host.removeAttribute(AttributeMarker.EventRender);
    const qrl = host.getAttribute(AttributeMarker.ComponentTemplate)! as any as QRL;
    const props: Props = extractPropsFromElement(host);
    assertString(qrl);
    jsxRenderComponent(doc, host, qrl, waitOn, props);
  }

  await flattenPromiseTree(waitOn);

  return hosts;
}
