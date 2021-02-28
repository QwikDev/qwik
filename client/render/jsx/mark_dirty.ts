/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertNotEqual, assertString } from '../../assert/index.js';
import { Component, Props } from '../../component/types.js';
import { QRL } from '../../import/qrl.js';
import { isPromise } from '../../util/promises.js';
import { HostElements } from '../types.js';
import { jsxRenderComponent } from './render.js';

interface QDocument extends Document {
  $qScheduledRender?: Promise<HostElements> | null;
}

export function markDirty(component: Component<any, any>): Promise<HostElements> {
  qDev && assertNotEqual(typeof requestAnimationFrame, 'undefined');
  const host = component.$host;
  // TODO: pull out constant strings;
  host.setAttribute('on:.render', host.getAttribute('::')!);
  const document = host.ownerDocument as QDocument;
  const promise = document.$qScheduledRender;
  if (isPromise(promise)) {
    return promise;
  }

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

export function extractPropsFromElement(host: Element) {
  const props: Props = {};
  const attrs = host.attributes;
  for (let i = 0, ii = attrs.length; i < ii; i++) {
    const attr = attrs[i];
    props[attr.name] = attr.value;
  }
  return props;
}
