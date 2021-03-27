/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ComponentType, IComponent } from '../component/types.js';
import { BaseInjector } from '../injection/base_injector.js';
import { ElementInjector, getClosestInjector } from '../injection/element_injector.js';
import { Injector, Props } from '../injection/types.js';
import { IService, ServicePromise, ServiceStateOf, ServiceType } from '../service/types.js';
import '../util/qDev.js';

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

  getComponent<COMP extends IComponent<any, any>>(
    componentType: ComponentType<COMP>
  ): Promise<COMP> {
    return this.getParent()!.getComponent<COMP>(componentType);
  }
  getService<SERVICE extends IService<any, any>>(
    serviceKey: string,
    state?: ServiceStateOf<SERVICE>,
    serviceType?: ServiceType<SERVICE>
  ): ServicePromise<SERVICE> {
    return this.getParent()!.getService<SERVICE>(serviceKey, state, serviceType);
  }
  getServiceState<SERVICE extends IService<any, any>>(
    propsOrKey: string | ServiceStateOf<SERVICE>
  ): Promise<SERVICE> {
    return this.getParent()!.getService<SERVICE>(propsOrKey);
  }
}
