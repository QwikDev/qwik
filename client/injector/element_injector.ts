/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {
  ComponentPropsOf,
  ComponentStateOf,
  Component,
  ComponentConstructor,
} from '../component/component.js';
import { qError, QError } from '../error/error.js';
import { qImport } from '../import/qImport.js';
import { QRL } from '../import/qrl.js';
import { keyToServiceAttribute, ServiceKey } from '../service/service_key.js';
import {
  Service,
  ServiceConstructor,
  ServicePromise,
  ServicePropsOf,
  ServiceStateOf,
} from '../service/service.js';
import { findAttribute } from '../util/dom_attrs.js';
import { AttributeMarker } from '../util/markers.js';
import '../util/qDev.js';
import { isHtmlElement } from '../util/types.js';
import { BaseInjector } from './base_injector.js';
import { Injector } from './types.js';

interface ServiceValue {
  promise: ServicePromise<Service<any, any>>;
  service: Service<any, any> | null;
}

export class ElementInjector extends BaseInjector {
  private component: Component<any, any> | null = null;
  private componentPromise: Promise<Component<any, any>> | null = null;
  private services: Map<ServiceKey, ServiceValue> | null = null;

  getParent(): Injector | null {
    let element = this.element.parentElement;
    while (element) {
      if (
        element.hasAttribute(AttributeMarker.Injector) ||
        element.hasAttribute(AttributeMarker.ComponentTemplate)
      ) {
        return getInjector(element);
      }
      element = element.parentElement;
    }
    return null;
  }

  getComponent<COMP extends Component<any, any>>(
    componentType: ComponentConstructor<COMP>
  ): Promise<COMP> {
    const injector: ElementInjector | null = this;
    const elementQRL: QRL | null = injector.element.getAttribute(
      AttributeMarker.ComponentTemplate
    ) as any;
    const $templateQRL = componentType.$templateQRL;
    if (!$templateQRL) {
      throw qError(QError.Component_missingTemplateQRL_component, componentType);
    }
    if (elementQRL === $templateQRL) {
      let component: COMP = this.component as COMP;
      if (component) {
        if (component instanceof componentType) {
          return this.componentPromise as Promise<COMP>;
        } else {
          throw qError(
            QError.Component_doesNotMatch_component_actual,
            componentType,
            (component as Object).constructor
          );
        }
      } else {
        const stateJSON = this.element.getAttribute(AttributeMarker.ComponentState);
        const state = stateJSON ? (JSON.parse(stateJSON) as ComponentStateOf<COMP>) : null;
        this.component = component = (new componentType(
          this.element,
          (this.elementProps as any) as ComponentPropsOf<COMP>,
          state
        ) as unknown) as COMP;
        return (this.componentPromise = new Promise<COMP>((resolve, reject) => {
          let promise: Promise<any>;
          if (state == null) {
            promise = Promise.resolve(component.$newState(component.$props)).then(
              (state: ComponentStateOf<COMP>) => {
                component.$state = state;
              }
            );
          } else {
            promise = Promise.resolve(component as COMP);
          }
          promise.then(() => component.$init()).then(() => resolve(component!), reject);
        }));
      }
    } else {
      const parentInjector = this.getParent() as ElementInjector;
      if (!parentInjector) {
        throw qError(QError.Component_notFound_component, componentType);
      }
      return parentInjector.getComponent(componentType);
    }
  }

  getService<SERVICE extends Service<any, any>>(
    serviceKey: ServiceKey<SERVICE>,
    forceState?: ServiceStateOf<SERVICE>,
    serviceType?: ServiceConstructor<SERVICE>
  ): ServicePromise<SERVICE> {
    let servicePromise = this.services?.get(serviceKey)?.promise as
      | ServicePromise<SERVICE>
      | undefined;
    if (servicePromise) return servicePromise as ServicePromise<SERVICE>;
    const serviceAttrName = keyToServiceAttribute(serviceKey);
    const self = this;
    return findAttribute(
      this.element,
      QError.Core_noAttribute_atr1_attr2_element,
      String(serviceKey),
      serviceFactory,
      serviceAttrName,
      serviceFactory
    );

    function serviceFactory(element: Element, attrName: string, attrValue: string) {
      const injector = element === self.element ? self : (getInjector(element) as ElementInjector);
      servicePromise = injector.services?.get(serviceKey)?.promise as
        | ServicePromise<SERVICE>
        | undefined;
      if (servicePromise) return servicePromise;
      // OK, if we got here we don't already have service, so we need to make it.

      injector.element.setAttribute(String(serviceKey), '');
      const serviceQRL = element.getAttribute(serviceAttrName);
      if (!serviceQRL) {
        throw qError(
          QError.Service_elementMissingServiceAttr_element_attr,
          element,
          serviceAttrName
        );
      }
      const serviceTypePromise = Promise.resolve(
        serviceType || qImport<ServiceConstructor<SERVICE>>(element, serviceQRL)
      );
      servicePromise = toServicePromise<SERVICE>(
        serviceKey,
        new Promise<SERVICE>((resolve, reject) => {
          serviceTypePromise.then((serviceType) => {
            if (typeof serviceType !== 'function') {
              throw qError(QError.QRL_expectFunction_url_actual, serviceQRL, serviceType);
            }
            let state: ServiceStateOf<SERVICE> | null = forceState || null;
            if (!state && attrName === String(serviceKey)) {
              state = JSON.parse(attrValue) as ServiceStateOf<SERVICE>;
              state!.$key = serviceKey;
            }
            const props = serviceType.$keyToProps(serviceKey);
            const service = (new serviceType(element, props, state) as unknown) as SERVICE;
            let chain: Promise<any>;
            if (state) {
              serviceValue.service = service;
              chain = Promise.resolve(service);
            } else {
              chain = service.$newState(props).then(
                (state: ServiceStateOf<SERVICE>) => {
                  serviceValue.service = service;
                  state.$key = serviceKey;
                  (service as { $state: ServiceStateOf<SERVICE> }).$state = state;
                  return service;
                },
                (e) => {
                  self.services?.delete(serviceKey);
                  return Promise.reject(e);
                }
              );
            }
            chain.then(() => {
              Promise.resolve(service.$init()).then(() => resolve(service));
            }, reject);
          }, reject);
        })
      );
      const serviceValue: ServiceValue = { promise: servicePromise, service: null };
      const services =
        injector.services || (injector.services = new Map<ServiceKey, ServiceValue>());
      services.set(serviceKey, serviceValue);
      return servicePromise;
    }
  }

  getServiceState<SERVICE extends Service<any, any>>(
    serviceKey: ServicePropsOf<SERVICE> | ServiceKey
  ): Promise<ServiceStateOf<SERVICE>> {
    const serviceAttrName = keyToServiceAttribute(serviceKey);
    return findAttribute(
      this.element,
      QError.Core_noAttribute_atr1_attr2_element,
      serviceKey as any,
      (element, serviceKeyAttr, serviceState) => {
        const injector = element == this.element ? this : (getInjector(element) as ElementInjector);
        const existingService = injector.services?.get(serviceKey)?.promise;
        if (existingService) {
          return existingService.then((service) => service.$state);
        }
        if (!serviceState) {
          throw qError(
            QError.Injector_missingSerializedState_serviceKey_element,
            serviceKey,
            element
          );
        }
        const state = JSON.parse(serviceState) as ServiceStateOf<SERVICE>;
        state.$key = serviceKeyAttr;
        return Promise.resolve(state);
      },
      serviceAttrName,
      (element) => {
        return getInjector(element)
          .getService(serviceKey)
          .then((service) => service.$state);
      }
    );
  }

  releaseService(key: ServiceKey) {
    if (this.services?.delete(key)) {
      this.element.removeAttribute((key as any) as string);
    }
  }

  serialize() {
    const element = this.element;
    const state = (this.component as null | Component<any, any>)?.$state;
    if (state != null) {
      element.setAttribute(AttributeMarker.ComponentState, JSON.stringify(state));
    }
    this.services?.forEach((service) => {
      const state = service.service?.$state;
      if (state) {
        element.setAttribute(state.$key, JSON.stringify(state, filterFrameworkKeys));
      }
    });
  }
}

function filterFrameworkKeys(this: any, key: string, value: any) {
  if (key.startsWith('$')) {
    return undefined;
  } else {
    return value;
  }
}

function toServicePromise<SERVICE extends Service<any, any>>(
  serviceKey: ServiceKey<SERVICE>,
  promise: Promise<SERVICE>
): ServicePromise<SERVICE> {
  const servicePromise = promise as ServicePromise<SERVICE>;
  servicePromise.$key = serviceKey;
  return servicePromise;
}

export function getComponentHost(element: Element): Element {
  let cursor: Element | null = element;
  while (cursor && !cursor.hasAttribute('::')) {
    cursor = cursor.parentElement;
  }
  if (!cursor) {
    throw qError(QError.Injector_noHost_element, element);
  }
  return cursor;
}

/**
 * Gets (or creates) an `Injector` at a particular DOM `Element`.
 *
 * If an element has an injector it is marked with `:` to designate it. This information
 * is used during serialization to locate all of the `Injector`s and serialize them.
 *
 * See: `serializeState`
 *
 * @param element -`Element` where the injector should be retrieved (or created)
 * @param create - Should the function lazy create the injector or just return `null`
 * @public
 */
export function getInjector(element: Element): Injector;
/** @public */
export function getInjector(element: Element, create: false): Injector | null;
export function getInjector(element: Element, create: boolean = true): Injector | null {
  if (!isHtmlElement(element)) {
    throw qError(QError.Injector_notElement_arg, element);
  }
  const _element = element as ElementExpando;
  let injector = _element.$injector;
  if (create && !injector) {
    _element.$injector = injector = new ElementInjector(element);
    // We need to mark the Storage so that serializeState knows where to look for State
    element.setAttribute(AttributeMarker.Injector, '');
  }
  return injector || null;
}

export interface ElementExpando extends Element {
  $injector?: ElementInjector;
}

export function getClosestInjector(element: Element): ElementInjector;
export function getClosestInjector(
  element: Element,
  throwIfNotFound: boolean
): ElementInjector | null;
export function getClosestInjector(
  element: Element,
  throwIfNotFound = true
): ElementInjector | null {
  let cursor: Element | null = element;
  while (cursor) {
    if (
      cursor.hasAttribute(AttributeMarker.Injector) ||
      cursor.hasAttribute(AttributeMarker.ComponentTemplate)
    ) {
      return getInjector(cursor) as ElementInjector;
    }
    cursor = cursor.parentElement;
  }
  if (throwIfNotFound) {
    throw qError(QError.Injector_notFound_element, element);
  }
  return null;
}
