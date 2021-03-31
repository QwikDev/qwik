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

export class EventInjector extends BaseInjector {
  event: Event;
  url: URL;
  props: Props;
  private parentInjector: ElementInjector | null = null;

  constructor(element: Element, event: Event, url: URL) {
    super(element);
    this.event = event;
    this.url = url;
    this.props = {};
    url.searchParams.forEach((value, key) => (this.props[key] = value));
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
    serviceKey: string,
    state?: ServiceStateOf<SERVICE>,
    serviceType?: ServiceConstructor<SERVICE>
  ): ServicePromise<SERVICE> {
    return this.getParent()!.getService<SERVICE>(serviceKey, state, serviceType);
  }

  getServiceState<SERVICE extends Service<any, any>>(
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey
  ): Promise<ServiceStateOf<SERVICE>> {
    return this.getParent()!.getServiceState<SERVICE>(propsOrKey);
  }

  releaseService(key: ServiceKey): void {
    return this.getParent()?.releaseService(key);
  }

  serialize(): void {
    throw qError(QError.Injector_eventInjectorNotSerializable);
  }
}
