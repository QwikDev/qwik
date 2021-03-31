/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertNotEqual, assertString, newError } from '../../assert/index.js';
import { Component } from '../../component/component.js';
import { QRL } from '../../import/qrl.js';
import { Props } from '../../injector/types.js';
import { Service, isService } from '../../service/service.js';
import { extractPropsFromElement } from '../../util/attributes.js';
import { isPromise } from '../../util/promises.js';
import { HostElements } from '../types.js';
import { jsxRenderComponent } from './render.js';

interface QDocument extends Document {
  $qScheduledRender?: Promise<HostElements> | null;
}

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
 * @param componentOrService - `Component` or `Service` instance.
 * @returns
 * @public
 */
export function markDirty(
  componentOrService: Component<any, any> | Service<any, any>
): Promise<HostElements> {
  if (isService(componentOrService)) return markServiceDirty(componentOrService);
  qDev && assertNotEqual(typeof requestAnimationFrame, 'undefined');
  const host = componentOrService.$host;
  // TODO: pull out constant strings;
  const document = host.ownerDocument as QDocument;
  host.setAttribute('on:.render', host.getAttribute('::')!);
  const promise = document.$qScheduledRender;
  if (isPromise(promise)) {
    return promise;
  }
  return scheduleRender(document);
}

function scheduleRender(document: QDocument): Promise<HostElements> {
  return (document.$qScheduledRender = new Promise<HostElements>((resolve, reject) => {
    requestAnimationFrame(() => {
      const waitOn: HostElements = [];
      const componentHosts = document.querySelectorAll('[on\\:\\.render]');
      componentHosts.forEach((host) => {
        // TODO: Utility method for string to QRL conversion.
        host.removeAttribute('on:.render');
        const qrl = (host.getAttribute('::')! as any) as QRL;
        qDev && assertString(qrl);
        const props: Props = extractPropsFromElement(host);
        jsxRenderComponent(host, qrl, waitOn, props, document);
        // TODO: this looks wrong and needs tests. Also resolve is not used.
        Promise.all(waitOn).then((hosts) => {
          document.$qScheduledRender = null;
          return hosts;
        }, reject);
      });
    });
  }));
}

function markServiceDirty(component: Service<any, any>): Promise<HostElements> {
  const key = component.$key;
  const document = component.$element.ownerDocument as QDocument;
  let foundListener = false;
  document.querySelectorAll(toAttrQuery('bind:' + key)).forEach((componentElement: HTMLElement) => {
    const qrl = componentElement.getAttribute('::')!;
    // TODO: Qerror;
    if (!qrl) {
      throw newError('Expecting component');
    }
    foundListener = true;
    componentElement.setAttribute('on:.render', qrl);
  });

  return foundListener ? scheduleRender(document) : Promise.resolve([]);
}
function toAttrQuery(key: string): any {
  return '[' + key.replace(/[:.-_]/g, (v) => '\\' + v) + ']';
}
