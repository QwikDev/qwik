/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ServiceKey } from '../service/service_key.js';
import { Service } from '../service/service.js';
import { Props } from '../injector/types.js';
import { QRL } from '../import/qrl.js';

/**
 * `EventService` is only visible during event processing and can be used to retrieve `Event`
 * related information.
 *
 * @public
 */
export class EventService extends Service<any, any> {
  static $qrl: QRL = '' as any;
  static $type = '$EventService';
  static $props = ['id'];
  static KEY: ServiceKey<EventService> = '$event:' as any;

  /**
   * Current `Event`.
   */
  event: Event;

  /**
   * `URL` used to load the current code.
   */
  url: URL;

  /**
   * `Props` extracted from the `url`.
   */
  props: Props;

  constructor(element: Element, event: Event, url: URL, props: Props) {
    super(element, null!, null!);
    (this as { $key: ServiceKey }).$key = EventService.KEY;
    this.event = event;
    this.url = url;
    this.props = props;
  }
}
