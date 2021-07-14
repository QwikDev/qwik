/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { EntityKey } from '../entity/entity_key';
import { Entity } from '../entity/entity';
import type { Props } from '../injector/types';
import type { QRL } from '../import/qrl';

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
