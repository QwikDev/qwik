/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { EntityKey } from '../entity/entity_key.js';
import { Entity } from '../entity/entity.js';
import { Props } from '../injector/types.js';
import { QRL } from '../import/qrl.js';

/**
 * `EventEntity` is only visible during event processing and can be used to retrieve `Event`
 * related information.
 *
 * @public
 */
export class EventEntity extends Entity<any, any> {
  static $qrl: QRL = '' as any;
  static $type = '$EventEntity';
  static $props = ['id'];
  static KEY: EntityKey<EventEntity> = '$event:' as any;

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
    (this as { $key: EntityKey }).$key = EventEntity.KEY;
    this.event = event;
    this.url = url;
    this.props = props;
  }
}
