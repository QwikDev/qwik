/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertNotEqual, assertString, newError } from '../../assert/index.js';
import { IComponent } from '../../component/types.js';
import { QRL } from '../../import/qrl.js';
import { Props } from '../../injection/types.js';
import { IService, isService } from '../../service/types.js';
import { extractPropsFromElement } from '../../util/attributes.js';
import { isPromise } from '../../util/promises.js';
import { HostElements } from '../types.js';
import { jsxRenderComponent } from './render.js';

interface QDocument extends Document {
  $qScheduledRender?: Promise<HostElements> | null;
}

// TODO: Tests
// TODO: docs
// TODO: Unify component/services
export function markDirty(
  component: IComponent<any, any> | IService<any, any>
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

function markServiceDirty(component: IService<any, any>): Promise<HostElements> {
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
