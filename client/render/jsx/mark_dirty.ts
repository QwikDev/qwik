/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Props } from '../../injection/types.js';
import { assertNotEqual, assertString, newError } from '../../assert/index.js';
import { Component } from '../../component/types.js';
import { QRL } from '../../import/qrl.js';
import { isPromise } from '../../util/promises.js';
import { HostElements } from '../types.js';
import { jsxRenderComponent } from './render.js';
import { IService, isService } from '../../service/types.js';

interface QDocument extends Document {
  $qScheduledRender?: Promise<HostElements> | null;
}

// TODO: Tests
// TODO: docs
// TODO: Unify component/services
export function markDirty(
  component: Component<any, any> | IService<any, any>
): Promise<HostElements> {
  if (isService(component)) return markServiceDirty(component);
  qDev && assertNotEqual(typeof requestAnimationFrame, 'undefined');
  const host = component.$host;
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
        Promise.all(waitOn).then((hosts) => {
          document.$qScheduledRender = null;
          return hosts;
        });
      });
    });
  }));
}

//TODO: duplicate code from injector.
export function extractPropsFromElement(host: Element) {
  const props: Props = {};
  const attrs = host.attributes;
  for (let i = 0, ii = attrs.length; i < ii; i++) {
    const attr = attrs[i];
    props[attr.name] = attr.value;
  }
  return props;
}

function markServiceDirty(component: IService<any, any>): Promise<HostElements> {
  const key = component.$key;
  const document = component.$injector.element.ownerDocument as QDocument;
  document.querySelectorAll(toAttrQuery('bind:' + key)).forEach((componentElement) => {
    console.log('markDirty:', componentElement);
    const qrl = componentElement.getAttribute('::')!;
    // TODO: error;
    if (!qrl) {
      throw newError('Expecting component');
    }
    componentElement.setAttribute('on:.render', qrl);
  });

  return scheduleRender(document);
}
function toAttrQuery(key: string): any {
  return '[' + key.replace(/[:.-_]/g, (v) => '\\' + v) + ']';
}
