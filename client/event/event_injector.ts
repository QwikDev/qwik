/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ServiceKey } from '../service/service_key.js';
import type { Component, ComponentConstructor } from '../component/component.js';
import { BaseInjector } from '../injector/base_injector.js';
import { ElementInjector, getClosestInjector } from '../injector/element_injector.js';
import { Injector, Props } from '../injector/types.js';
import {
  Service,
  ServiceConstructor,
  ServicePromise,
  ServicePropsOf,
  ServiceStateOf,
} from '../service/service.js';
import '../util/qDev.js';
import { qError, QError } from '../error/error.js';
import { EventService } from './event_service.js';

export class EventInjector extends BaseInjector {
  private eventService: EventService;
  private parentInjector: ElementInjector | null = null;

  constructor(element: Element, event: Event, url: URL) {
    super(element);
    const props: Props = {};
    url.searchParams.forEach((value, key) => (props[key] = value));
    this.eventService = new EventService(element, event, url, props);
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

  getService<SERVICE extends Service<any, any>>(
    serviceKey: ServiceKey<SERVICE>,
    state?: ServiceStateOf<SERVICE>,
    serviceType?: ServiceConstructor<SERVICE>
  ): ServicePromise<SERVICE> {
    if ((serviceKey as any) === EventService.KEY) return this.eventService as any;
    return this.getParent()!.getService(serviceKey, state, serviceType);
  }

  getServiceState<SERVICE extends Service<any, any>>(
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey<SERVICE>
  ): Promise<ServiceStateOf<SERVICE>> {
    return this.getParent()!.getServiceState(propsOrKey);
  }

  releaseService(key: ServiceKey): void {
    return this.getParent()?.releaseService(key);
  }

  serialize(): void {
    throw qError(QError.Injector_eventInjectorNotSerializable);
  }
}
