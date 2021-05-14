/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { qImport, qParams, toBaseURI, toUrl } from '../import/qImport.js';
import { QError, qError } from '../error/error.js';
import { findAttribute } from '../util/dom_attrs.js';
import { AttributeMarker } from '../util/markers.js';
import { EventHandler } from './types.js';
import { QRL } from '../import/qrl.js';
import { fromCamelToKebabCase } from '../util/case.js';

/**
 * Event handler which re-emits the event under a different event name.
 *
 * This function is useful when you need to listen on some event and need to
 * re-emit the event under different name.
 *
 * # Example
 * ```
 * <my-component on:open="./onOpen" on:close="./onClose">
 *   <button on:click="base:qoot#emitEvent?$type=open&someArg=someValue">open</button>
 *   <button on:click="base:qoot#emitEvent?$type=close&someArg=someValue">close</button>
 * </my-component>
 * ```
 *
 * In the above example clicking on `<button>open</button>` will trigger `on:click` which will
 * re-emit the event as `open` which is than processed by `<my-component on:open>`.
 *
 * This is useful when it is desirable to separate the trigger mechanism from the implementation.
 *
 * The `emitEvent` takes URL `$type` property as the new event name to look for. Any additional
 * properties on the URL will be appended to the event object.
 *
 * @param element - `Element` of the original event.
 * @param event - Original `Event`.
 * @param url - Original `URL`.
 * @public
 */
export function emitEvent(element: HTMLElement, event: Event, url: URL): Promise<any> {
  const params = qParams(url);
  const $type = params.get('$type');
  if ($type == null) {
    throw qError(QError.Event_emitEventRequiresName_url, url);
  }
  const returnValue = findAttribute(
    element,
    QError.Event_emitEventCouldNotFindListener_event_element,
    AttributeMarker.EventPrefix + fromCamelToKebabCase($type),
    (element, attrName, attrValue) => {
      const qrl = attrValue as unknown as QRL<EventHandler<any, any, any>>;
      return Promise.resolve(qImport(element, qrl)).then((fn: Function) => {
        const dstUrl = toUrl(toBaseURI(element), qrl);
        const event = new CustomEvent($type);
        params.forEach((value, key) => {
          (event as any)[key] = value;
        });
        return fn(element, event, dstUrl);
      });
    }
  );
  return Promise.resolve(returnValue);
}
