/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { EntityKey } from '../entity/entity_key';
import type { Component, ComponentConstructor } from '../component/component';
import { BaseInjector } from '../injector/base_injector';
import { ElementInjector, getClosestInjector } from '../injector/element_injector';
import type { Injector, Props } from '../injector/types';
import type {
  Entity,
  EntityConstructor,
  EntityPromise,
  EntityPropsOf,
  EntityStateOf,
} from '../entity/entity';
import { qError, QError } from '../error/error';
import { EventEntity } from './event_entity';
import { qParams } from '../import/qImport';

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
