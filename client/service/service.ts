/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { getConfig, QConfig } from '../config/qGlobal.js';
import { qError, QError } from '../error/error.js';
import { qImport } from '../import/qImport.js';
import { QRL } from '../import/types';
import { keyToServiceAttribute } from '../injection/element_injector.js';
import { getInjector } from '../injection/element_injector.js';
import { ServiceType } from '../service/types.js';
import { getFilePathFromFrame } from '../util/base_uri.js';
import { fromCamelToKebabCase } from '../util/case.js';
import { keyToProps, propsToKey } from './service_key.js';
import { ServiceKey, ServicePromise, ServicePropsOf, ServiceStateOf } from './types.js';

/**
 * Service allows creation of lazy loading class whose state is serializable.
 *
 * Services are a basic building blocks of Qoot applications. The basic idea behind services
 * is that their state is serializable and thus service lifetime can span runtime environments.
 * (ie. service instance can be created by server and then used by the client.)
 *
 * Services are broken down into three parts:
 * 1) A global unique key. A key is a string which uniquely identifies a service. Typically
 *    keys contain only a single id, such as `myService:123`, however they can be hierarchical
 *    as in `project:123:456`. Keys are immutable for a given service instance. Keys
 *    get parsed into `Props` of the service.
 * 2) A JSON serializable `State` which is persisted in DOM when the application is dehydrated.
 * 3) A transient service instance. We say transient because it does not get deserialized.
 *
 * The basic idea of service is that the transient instance that can be recreated from the props and
 * state on as needed basis.
 *
 * Services have two responsibilities:
 * 1) to provide behavior around `State`. This comes in form of async methods on the service class.
 * 2) to materialize new data base on the key/props.
 *
 * Let's say we would like to implement a todo item.
 *
 * ```
 * // Define Props which will turn into key: `todo:123`
 * interface TodoItemProps {
 *   id: string;
 * }
 *
 * interface TodoItem {
 *   completed: boolean,
 *   text: string;
 * }
 *
 * class TodoItemService extends Service<TodoItemProps, TodoItem> {
 *   $qrl = QRL`./path/to/service/TodoItem`;
 *   $type = 'todo';
 *   $props = ['id'];
 *
 *   async archive() {
 *     // service specific method/behavior.
 *   }
 * }
 * ```
 *
 * ## Instantiating a service.
 *
 * Services are attached and store their data in the DOM/HTML. For this reason when the service is
 * created `Element` must be specified.
 *
 * ```
 * const todoItemService = await TodoItemService.$hydrate(
 *    element,      // Element where the service should be attached
 *    {id: '123'},  // Service's identity. Converts to `item:123`
 *    {completed: false, text: 'sample task'} // Initial state.
 * );
 * expect(todoItemService.$state)
 *   .toEqual({completed: false, text: 'sample task'});
 * ```
 * Results in `element` DOM to look like so:
 * ```
 * <div ::todo="./path/to/service/TodoItem"
 *      todo:123="{completed: false, text: 'sample task'}">
 * ```
 *
 * NOTE:
 *   - `::todo` attribute is an import pointer to `TodoItemService` class.
 *   - `item:*` attribute is a specific instance of the `TodoItemService`.
 *
 * At this point if the application gets serialized into HTML we can look up the service in same way.
 *
 * ## Rehydration
 *
 * We can use the same code to rehydrate the service from HTML/DOM.
 *
 * ```
 * const todoItemService = await TodoItemService.$hydrate(element, {id: '123'});
 * expect(todoItemService.$state)
 *   .toEqual({completed: false, text: 'sample task'});
 * ```
 * The above will either return the same instance of the service (or new instance if the application
 * serialized into HTML.) In either case the `$state` will contain the same data.
 *
 * ## Lookup
 *
 * There is a third situation when we ask to rehydrate a service which has no serialized state in the DOM.
 *
 * Let's assume that the DOM looks like this.
 * ```
 * <div ::todo="./path/to/service/TodoItem">
 * ```
 *
 * We can still use the same code to ask for `item:123` like so.
 * ```
 * const todoItemService = await TodoItemService.$hydrate(element, {id: '123'});
 * expect(todoItemService.$state)
 *   .toEqual({completed: false, text: 'sample task'});
 * ```
 *
 * In this cases there is no serialized state. For this reason the component executes the `$newState` method.
 *
 * ```
 * class TodoItemService extends Service<TodoItemProps, TodoItem> {
 *   $qrl = QRL`./path/to/service/TodoItem`;
 *   $type = 'todo';
 *   $keyProps = ['id'];
 *
 *   async $newState(props: TodoItemProps): Promise<TodoItem> {
 *     //  Execute code to look up the state.
 *   }
 * }
 * ```
 *
 * Finally the service can be released.
 * ```
 * todoItemService.$release()
 * ```
 * Which will remove the state from the DOM/HTML.
 * ```
 * <div ::todo="./path/to/service/TodoItem">
 * ```
 * Note: `$release` is not the same thing as deleting/destroying the data. It merely tells Qoot to
 * not serialize the state into the DOM/HTML.
 *
 */
export class Service<PROPS, STATE> {
  private static $config: QConfig = null!;

  /**
   * A service name.
   *
   * When services are serialized each service needs to have a unique name.
   * ```
   * class MyService extends Service<MyServiceProps, MyServiceState> {
   *   $qrl = QRL`./path/to/service/MyService`;
   *   $type = 'myService';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * The above definition will result in attribute with a QRL pointer like so.
   * ```
   * <div ::myService="./path/to/service/MyService">
   * ```
   */
  static get $type(): string {
    return this.$_name;
  }
  static set $type(name: string) {
    const stack = new Error().stack!;
    const frames = stack.split('\n');
    // 0: Error
    // 1:   at setter (this function)
    // 2:   at caller (this is what we are looking for)
    const base = getFilePathFromFrame(frames[2]);
    this.$config = getConfig(base);
    this.$_name = name;
  }
  private static $_name: string = null!;

  /**
   * A QRL location.
   *
   * When services are serialized it is necessary to leave a pointer to location where the service
   * can be lazy loaded from. `$qrl` serves that purpose.
   *
   * ```
   * class MyService extends Service<MyServiceProps, MyServiceState> {
   *   $qrl = QRL`./path/to/service/MyService`;
   *   $type = 'myService';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * The above definition will result in all instances of this service to be encoded with
   * `myService` name.
   * ```
   * <div ::myService="./path/to/service/MyService"
   *      myService:123:456="{completed: false, text: 'sample task'}">
   * ```
   */
  static $qrl: QRL;

  /**
   * Order of properties in `Props` which define the service key.
   *
   * A service is uniquely identified by a key such as `myService:123:456`. The key consists
   * of `myService` which associates the key with a specific service.
   *
   * For example:
   * ```
   * <div ::myService="./path/to/service/MyService"
   *      myService:123:456="{completed: false, text: 'sample task'}">
   * ```
   * The key `myService:123:456` is associated with `myService` which is declared in `::myService`
   * attribute. The `123:456` are property values. In order for the key to be converted into
   * `Props` it is necessary to know what each of the values point to. `$keyProps` stores that
   * information.
   *
   * For example a service defined like so:
   * ```
   * class MyService extends Service<MyServiceProps, MyServiceState> {
   *   $qrl = QRL`./path/to/service/MyService`;
   *   $type = 'myService';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   * Would result it `myService:123:456` to be convert to a `Prop` of
   * `{project: '123', task: '456'}`. Notice that the `$keyProps` define
   * property names for the key value positions.
   */
  static $keyProps: string[] = [];

  /**
   * Attach QRL definition to an `Element`.
   *
   * Attaching a service to an `Element` means that an attribute with service name is left
   * in DOM. This is later used when trying to resolve the service.
   *
   * ```
   * class MyService extends Service<MyProps, MyState> {
   *   $type = 'MyService';
   *   $qrl = QRL`somePath/MyService`;
   * }
   *
   * MyService.$attachService(element);
   * ```
   * will result in:
   *
   * ```
   * <div ::my-service="somePath/MyService">
   * ```
   *
   * @param element Element where the service definition should be attached.
   */
  static $attachService<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element
  ): void {
    const serviceType: typeof Service = this as any;
    if (!serviceType.$type) {
      throw qError(QError.Service_no$type_service, serviceType);
    }
    if (!serviceType.$qrl) {
      throw qError(QError.Service_no$qrl_service, serviceType);
    }
    // TODO: needs util method?
    const attributeName = '::' + fromCamelToKebabCase(serviceType.$type);
    const currentQRL = element.getAttribute(attributeName);
    if (!currentQRL) {
      element.setAttribute(attributeName, String(serviceType.$qrl));
    } else if (currentQRL != (serviceType.$qrl as any)) {
      throw qError(
        QError.Service_nameCollision_name_currentQrl_expectedQrl,
        serviceType.$type,
        currentQRL,
        serviceType.$qrl
      );
    }
  }

  /**
   * Attach service instance state to an `Element`.
   *
   * Attaching a service state to an `Element` means that the service props are serialized into
   * service instance key and service state is serialized into the service value.
   *
   * ```
   * class MyService extends Service<MyProps, MyState> {
   *   $type = 'MyService';
   *   static $keyProps = ['id'];
   *   $qrl = QRL`somePath/MyService`;
   * }
   *
   * MyService.$attachServiceState(element, {id:123}, {text: 'some text'});
   * ```
   * will result in:
   * ```
   * <div ::my-service="somePath/MyService"
   *      my-service:123="{text: 'some text'}">
   * ```
   *
   * @param element Element where the service definition should be attached.
   */
  static $attachServiceState<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    host: Element,
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey,
    state: ServiceStateOf<SERVICE> | null
  ): void {
    const serviceType = (this as any) as typeof Service;
    serviceType.$attachService(host);
    const key = typeof propsOrKey == 'string' ? propsOrKey : propsToKey(serviceType, propsOrKey);
    if (!host.hasAttribute(key)) {
      host.setAttribute(key, state == null ? '' : JSON.stringify(state));
    }
  }

  /**
   * Re-hydrate a service.
   *
   * Re-hydration is a process of turning a Service-key into a Service instance.
   * There are these possible scenarios:
   * - `MyService.$hydrate(element, props, state)`: Create new service (override
   *   the service with new `state` if already exists.)
   * - `MyService.$hydrate(element, props)`:
   *   - If state exists in HTML/DOM use that
   *   - If no state exist in HTML/DOM invoke `Service.$newState`.
   *     - Possibly throw an error.
   *
   * @param element Element to which the service should be (or is) attached
   * @param propsOrKey Service key either in string or `Props` format.
   * @param state Optional new state for the service.
   * @returns `ServicePromise` which contains the `$key` property for synchronous retrieval.
   */

  static $hydrate<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element,
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey,
    state?: ServiceStateOf<SERVICE>
  ): ServicePromise<SERVICE> {
    const serviceType = (this as any) as typeof Service;
    const key = typeof propsOrKey == 'string' ? propsOrKey : propsToKey(serviceType, propsOrKey);
    if (state) state.$key = key;
    const serviceProviderKey = keyToServiceAttribute(key);
    if (!element.hasAttribute(serviceProviderKey)) {
      (this as ServiceType<any>).$attachService(element);
    }
    const injector = getInjector(element);
    return injector.getService(key, state, this as any);
  }

  // TODO: docs
  static $keyToProps<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    key: ServiceKey
  ): ServicePropsOf<SERVICE> {
    return keyToProps(this as any, key) as ServicePropsOf<SERVICE>;
  }

  // TODO: docs
  static $propsToKey<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    props: ServicePropsOf<SERVICE>
  ): ServiceKey {
    return propsToKey(this as any, props) as ServiceKey;
  }

  /////////////////////////////////////////////////
  readonly $element: Element;
  readonly $props: PROPS;
  readonly $state: STATE;
  readonly $key: string;

  constructor(element: Element, props: PROPS, state: STATE | null) {
    const serviceType = getServiceType(this);
    this.$props = props;
    this.$state = state!; // TODO: is this right?
    this.$element = element!;
    this.$key = propsToKey(serviceType as any, props);
    serviceType.$attachService(element);
    serviceType.$attachServiceState(element, props, null);
  }

  /**
   * Lazy loads code through QRL and invokes it.
   *
   * This method is used inside services to define custom API on a service.
   *
   * ```
   * class MyService extends Service<MyServiceProps, MyServiceState> {
   *   $qrl = QRL`./path/to/service/MyService`;
   *   $type = 'myService';
   *   $keyProps = ['project', 'task'];
   *
   *   async myUppercase(text: string): Promise<string> {
   *     return this.$invokeQRL(
   *         import.meta.url,
   *         QRL<(text: string) => string>`path_to_lazy_loaded_function`,
   *         text
   *       );
   *   }
   * }
   * ```
   *
   * @param qrl QRL to the function to lazy load and execute.
   * @param args arguments to pass to the QRL function.
   * @returns
   */
  async $invokeQRL<ARGS extends any[], RET>(
    qrl: QRL<(...args: ARGS) => RET>,
    ...args: ARGS
  ): Promise<RET> {
    const service = getServiceType(this);
    const delegate = await qImport(service.$config, qrl);
    return getInjector(this.$element).invoke(delegate as any, this, ...args);
  }

  /**
   * Invoked during hydration if state is not provide or can't be ry-hydrated from HTML/DOM.
   *
   * Lifecycle order:
   * - `new Service(...)`
   * - `$newState(props)`: Invoked if no serialized state found in DOM.
   * - `$init()`
   * - Service returned by the `Injector`.
   * ```
   * class MyService extends Service<MyServiceProps, MyServiceState> {
   *   $qrl = QRL`./path/to/service/MyService`;
   *   $type = 'myService';
   *   $keyProps = ['project', 'task'];
   *
   *   async materializeState(props: MyServiceProps): Promise<string> {
   *     // either compute new state OR call to the backend to retrieve it.
   *     return state;
   *   }
   * }
   * ```
   *
   * @param props
   */
  $newState(keyProps: PROPS): Promise<STATE> {
    const serviceType = this.constructor as typeof Service;
    throw qError(QError.Service_noState_service_props, serviceType.$type, keyProps);
  }

  /**
   * Lifecycle method invoked on hydration.
   *
   * After the service creation and after the state is restored (either from DOM or by invoking
   * `$newState`) this method is invoked. The purpose of this method is to allow the service
   * to compute any transient state.
   *
   * Lifecycle order:
   * - `new Service(...)`
   * - `$newState(props)`: Invoked if no serialized state found in DOM.
   * - `$init()`
   * - Service returned by the `Injector`.
   */
  async $init() {}

  /**
   * Release the service.
   *
   * Releasing service means that the service is released form memory and it
   * becomes eligible for garbage collection. It also removes the service state
   * from the HTML/DOM.
   *
   * Releasing a state does not imply that the state should be deleted on backend.
   */
  $release(): void {
    const injector = getInjector(this.$element);
    const serviceType = getServiceType(this);
    const key = propsToKey(serviceType, this.$props);
    injector.releaseService(key);
  }
}

/**
 * Retrieve the `ServiceType` from the `Service`
 * @param service
 * @returns
 */
function getServiceType<SERVICE extends Service<any, any>>(service: SERVICE): typeof Service {
  if (!(service instanceof Service)) {
    throw qError(QError.Service_expected_obj, service);
  }
  const serviceType = (service.constructor as any) as typeof Service;
  if (serviceType.$attachServiceState !== Service.$attachServiceState) {
    throw qError(QError.Service_overridesConstructor_service, service);
  }
  return serviceType;
}
