/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { EntityKey } from '../entity/entity_key.js';
import type { Component, ComponentConstructor } from '../component/component.js';
import { BaseInjector } from '../injector/base_injector.js';
import { ElementInjector, getClosestInjector } from '../injector/element_injector.js';
import { Injector, Props } from '../injector/types.js';
import {
  Entity,
  EntityConstructor,
  EntityPromise,
  EntityPropsOf,
  EntityStateOf,
} from '../entity/entity.js';
import '../util/qDev.js';
import { qError, QError } from '../error/error.js';
import { EventEntity } from './event_entity.js';
import { qParams } from '../import/qImport.js';

export class EventInjector extends BaseInjector {
  private eventEntity: EventEntity;
  private parentInjector: ElementInjector | null = null;

  constructor(element: Element, event: Event, url: URL) {
    super(element);
    const props: Props = {};
    qParams(url).forEach((value, key) => (props[key] = value));
    this.eventEntity = new EventEntity(element, event, url, props);
  }

  getParent(): Injector | null {
    const parent = this.parentInjector;
    if (parent) return parent;
    return (this.parentInjector = getClosestInjector(this.element, false));
  }

  getComponent<COMP extends Component<any, any>>(
    componentType: ComponentConstructor<COMP>
  ): Promise<COMP> {
    return this.getParent()!.getComponent<COMP>(componentType);
  }

  getEntity<SERVICE extends Entity<any, any>>(
    entityKey: EntityKey<SERVICE>,
    state?: EntityStateOf<SERVICE>,
    entityType?: EntityConstructor<SERVICE>
  ): EntityPromise<SERVICE> {
    if ((entityKey as any) === EventEntity.KEY) return this.eventEntity as any;
    return this.getParent()!.getEntity(entityKey, state, entityType);
  }

  getEntityState<SERVICE extends Entity<any, any>>(
    propsOrKey: EntityPropsOf<SERVICE> | EntityKey<SERVICE>
  ): Promise<EntityStateOf<SERVICE>> {
    return this.getParent()!.getEntityState(propsOrKey);
  }

  releaseEntity(key: EntityKey): void {
    return this.getParent()?.releaseEntity(key);
  }

  serialize(): void {
    throw qError(QError.Injector_eventInjectorNotSerializable);
  }
}
