/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ComponentType, IComponent } from '../component/types.js';
import { QError, qError } from '../error/error.js';
import { IService, ServicePromise, ServiceStateOf, ServiceType } from '../service/types.js';
import '../util/qDev.js';
import { BaseInjector } from './base_injector.js';
import { getClosestInjector } from './element_injector.js';
import { Injector, Props } from './types.js';

export class EventInjector extends BaseInjector {
  event: Event;
  url: URL;
  props: Props;

  constructor(element: Element, event: Event, url: URL) {
    super(element);
    this.event = event;
    this.url = url;
    this.props = {};
    url.searchParams.forEach((value, key) => (this.props[key] = value));
  }

  getParent(): Injector | null {
    return getClosestInjector(this.element, false);
  }

  getComponent<COMP extends IComponent<any, any>>(
    componentType: ComponentType<COMP>
  ): Promise<COMP> {
    throw new Error('Method not implemented.');
  }
  getService<S extends IService<any, any>>(
    serviceKey: string,
    state?: ServiceStateOf<S>,
    serviceType?: ServiceType<S>
  ): ServicePromise<S> {
    throw new Error('Method not implemented.');
  }
  getServiceState<S extends IService<any, any>>(
    propsOrKey: string | ServiceStateOf<S>
  ): Promise<S> {
    throw new Error('Method not implemented.');
  }
}

export function ensureEventInjector(injector: Injector): EventInjector {
  if (injector instanceof EventInjector) {
    return injector;
  }
  throw qError(
    QError.Injection_expectedSpecificInjector_expected_actual,
    EventInjector,
    injector?.constructor
  );
}

function urlToParams(url: URL): Props {
  const props: Props = {};
  url.searchParams.forEach((value, key) => (props[key] = value));
  return props;
}
