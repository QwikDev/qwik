/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { AttributeMarker } from '../util/markers.js';
import { getConfig, QConfig } from '../config/qGlobal.js';
import { qError, QError } from '../error/error.js';
import { qImport } from '../import/qImport.js';
import { QRL } from '../import/qrl.js';
import { keyToServiceAttribute, ServiceKey } from './service_key.js';
import { getFilePathFromFrame } from '../util/base_uri.js';
import { fromCamelToKebabCase } from '../util/case.js';
import { keyToProps, propsToKey } from './service_key.js';
import { getInjector } from '../injector/element_injector.js';

/**
 * `Service` allows creation of lazy loading class whose state is serializable.
 *
 * Services are a basic building block of Qoot applications. The basic idea behind services
 * is that their state is serializable and thus a service lifetime can span runtime environments
 * (i.e. service instances can be created by the server and then used by the client).
 *
 * Services are broken down into three parts:
 * 1) A global unique key. A key is a string which uniquely identifies a service. Typically
 *    keys contain only a single id, such as `myService:123`, however they can be hierarchical
 *    as in `project:123:456`. Keys are immutable for a given service instance. Keys get parsed
 *    into the `Props` of the service.
 * 2) A JSON serializable `State` which is persisted in DOM when the application is dehydrated.
 * 3) A transient service instance. We say transient because it does not get deserialized.
 *
 * The basic idea of a service is that the transient instance can be recreated from the `Props` and
 * `State` on as-needed basis.
 *
 * Services have two responsibilities:
 * 1) to provide behavior around `State`. This comes in form of async methods on the service class.
 * 2) to materialize new data based on the `key` and `Props`.
 *
 * Let's say we would like to implement a todo item.
 *
 * ```
 * // Define Props which will serialize into the key: `todo:123`.
 * interface TodoItemProps {
 *   id: string;
 * }
 *
 * // Define State which can be serialized onto the DOM during dehydration.
 * interface TodoItem {
 *   completed: boolean,
 *   text: string;
 * }
 *
 * // Define a class whose instances are the transient service objects.
 * class TodoItemService extends Service<TodoItemProps, TodoItem> {
 *   $qrl = QRL`./path/to/service/TodoItem`;
 *   $type = 'todo';
 *   $keyProps = ['id'];
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
 * created an `Element` must be specified.
 *
 * ```
 * const todoItemService = await TodoItemService.$hydrate(
 *    element,      // Element where the service should be attached.
 *    {id: '123'},  // Service's identity. Serializes to `item:123`.
 *    {completed: false, text: 'sample task'} // Initial state.
 * );
 * expect(todoItemService.$state)
 *   .toEqual({completed: false, text: 'sample task'});
 * ```
 *
 * When dehydrated this results in HTML that looks like:
 *
 * ```
 * <div ::todo="./path/to/service/TodoItem"
 *      todo:123="{completed: false, text: 'sample task'}">
 * ```
 *
 * NOTE:
 *   - `::todo` The QRL to import the `TodoItemService` class.
 *   - `todo:123` Represents a specific instance of the `TodoItemService`, with `id: 123` and state serialized as JSON.
 *
 *
 * ## Rehydration
 *
 * We can use the same code to rehydrate the service from HTML/DOM.
 *
 * ```
 * const todoItemService =
 *   await TodoItemService.$hydrate(element, {id: '123'});
 * expect(todoItemService.$state)
 *   .toEqual({completed: false, text: 'sample task'});
 * ```
 *
 * The above will either return the same instance of the service that was created above or a new instance
 * if the application was dehydrated into HTML. In either case the `$state` will contain the same data.
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
 *     //  Execute code to create or look up the state.
 *   }
 * }
 * ```
 *
 * ## Release
 *
 * Finally, when the service instance no longer needs to be associated with an element, it can be released.
 *
 * ```
 * todoItemService.$release()
 * ```
 *
 * This will remove the state from its element, resulting in the following HTML.
 *
 * ```
 * <div ::todo="./path/to/service/TodoItem">
 * ```
 *
 * Note: `$release()` is not the same thing as deleting/destroying the data. It merely tells Qoot to
 * not serialize the state into the DOM/HTML.
 *
 * @public
 */
export class Service<PROPS, STATE> {
  private static $config: QConfig = null!;

  /**
   * A service name.
   *
   * All service instances of this type have this name.
   *
   * When services are serialized each service instance needs to have a unique name, which is a
   * combination of its `$type` name and its `Props` values, the keys of which are defined in `$keyProps`.
   *
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
    if (!name.startsWith('$')) {
      // Only do this for non-internal services.
      const stack = new Error().stack!;
      const frames = stack.split('\n');
      // 0: Error
      // 1:   at setter (this function)
      // 2:   at caller (this is what we are looking for)
      const base = getFilePathFromFrame(frames[2]);
      this.$config = getConfig(base);
      this.$_name = name;
    }
  }
  private static $_name: string = null!;

  /**
   * The QRL location of this Service type.
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
   *
   * ```
   * <div ::myService="./path/to/service/MyService"
   *      myService:123:456="{completed: false, text: 'sample task'}">
   * ```
   *
   * The key `myService:123:456` is associated with `myService` which is declared in `::myService`
   * attribute. The `123:456` are property values. In order for the key to be converted into
   * `Props` it is necessary to know what each of the values point to. `$keyProps` stores that
   * information.
   *
   * For example a service defined like so:
   *
   * ```
   * class MyService extends Service<MyServiceProps, MyServiceState> {
   *   $qrl = QRL`./path/to/service/MyService`;
   *   $type = 'myService';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * Would result it `myService:123:456` to be convert to a `Props` of
   * `{project: '123', task: '456'}`. Notice that the `$keyProps` define
   * property names for the key value positions.
   */
  // TODO: Throw error if `$keyProps` is not defined.
  static $keyProps: string[] = [];

  /**
   * Attach QRL definition of the `Service` to an `Element`.
   *
   * Attaching a service to an `Element` means that an attribute with the service name (`$type`) is left
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
   *
   * will result in:
   *
   * ```
   * <div ::my-service="somePath/MyService">
   * ```
   *
   * @param element - Element where the service definition should be attached.
   */
  // TODO: Is this the right name? we are not attaching, we are more like defining a provider
  static $attachService<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element
  ): void {
    const serviceType: ServiceConstructor<SERVICE> = this as any;
    if (!serviceType.$type) {
      throw qError(QError.Service_no$type_service, serviceType);
    }
    if (!serviceType.$qrl) {
      throw qError(QError.Service_no$qrl_service, serviceType);
    }
    const attributeName =
      AttributeMarker.ServiceProviderPrefix + fromCamelToKebabCase(serviceType.$type);
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
   * Attaching a service state to an `Element` means that the service `Props` are serialized into
   * service instance key and service `State` is serialized into the service value.
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
   *
   * will result in:
   *
   * ```
   * <div ::my-service="somePath/MyService"
   *      my-service:123="{text: 'some text'}">
   * ```
   *
   * @param element - Element where the service definition should be attached.
   */
  static $attachServiceState<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    host: Element,
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey,
    state: ServiceStateOf<SERVICE> | null
  ): void {
    const serviceType = this as any as ServiceConstructor<SERVICE>;
    serviceType.$attachService(host);
    const key = typeof propsOrKey == 'string' ? propsOrKey : propsToKey(serviceType, propsOrKey);
    if (!host.hasAttribute(String(key))) {
      host.setAttribute(String(key), state == null ? '' : JSON.stringify(state));
    }
  }

  /**
   * Re-hydrate a service instance.
   *
   * Re-hydration is the process of retrieving or creating a transitive instance of a service
   * based on a service `key`.
   *
   * There are these possible scenarios:
   * - `MyService.$hydrate(element, props, state)`:
   *   Create new service (overriding any serialized `State` with the new `state`).
   * - `MyService.$hydrate(element, props)`: compute the service `key` from props:
   *   - If `State` exists in the HTML/DOM for the `key`, use that.
   *   - If no `State` exists in HTML/DOM for the `key` invoke `Service.$newState()`.
   *     - Possibly throw an error.
   *
   * @param element - Element to which the service should be (or is) attached.
   * @param propsOrKey - Service key either serialized to a string or in `Props` format.
   * @param state - Optional new state for the service instance.
   * @returns `ServicePromise` which contains the `$key` property for synchronous retrieval.
   */
  static $hydrate<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element,
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey,
    state?: ServiceStateOf<SERVICE>
  ): ServicePromise<SERVICE> {
    const serviceType = this as any as ServiceConstructor<SERVICE>;
    const key: ServiceKey<SERVICE> =
      typeof propsOrKey == 'string'
        ? (propsOrKey as ServiceKey<SERVICE>)
        : propsToKey(serviceType, propsOrKey);
    if (state) state.$key = key;
    const serviceProviderKey = keyToServiceAttribute(key);
    if (!element.hasAttribute(serviceProviderKey)) {
      (this as unknown as ServiceConstructor<SERVICE>).$attachService(element);
    }
    const injector = getInjector(element);
    return injector.getService(key, state, this as any);
  }

  /**
   * Converts a serialized `ServiceKey` into `ServiceProps`.
   *
   * A `ServiceKey` is formatted as: `<serviceName>:<value1>:<value2>:...`.
   *
   * The purpose of the keys is to be globally unique identifiers in the application
   * so that service instances can be identified. The keys are string representations
   * because it is important to be able to serialize the keys to HTML.
   *
   * Service instances prefer to have a parsed version of the key as `ServiceProps`.
   * A `ServiceKey` contains values only, `ServiceProps` are key/value pairs. This function uses
   * `Service.$keyProps` to identify with which property each value should be associated with.
   *
   * @param key - the serialized `ServiceKey` to parse to `ServiceProps`.
   * @returns the parsed `ServiceProps`.
   */
  static $keyToProps<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    key: ServiceKey
  ): ServicePropsOf<SERVICE> {
    return keyToProps(this as any, key) as ServicePropsOf<SERVICE>;
  }

  /**
   * Serialize `ServiceProps` into a `ServiceKey` string.
   *
   * A `ServiceKey` is formatted as: `<serviceName>:<value1>:<value2>:...`.
   *
   * The purpose of the keys is to be globally unique identifiers in the application
   * so that service instances can be identified. The keys are string representations
   * because it is important to be able to serialize the keys to HTML.
   *
   * Service instances prefer to have a parsed version of the key as `ServiceProps`.
   * A `ServiceKey` contains values only, `ServiceProps` are key/value pairs. This function uses
   * `Service.$keyProps` to identify with which property each value should be associated with.
   *
   * @param props - the parsed `ServiceProps` to serialize.
   * @returns the serialized `ServiceKey`.
   */
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
  readonly $key: ServiceKey<any>; // TODO(type): `any` is not correct here.

  constructor(element: Element, props: PROPS, state: STATE | null) {
    const serviceType = getServiceType(this) as ServiceConstructor<Service<PROPS, STATE>>;
    this.$props = props;
    this.$state = state!; // TODO: is this right?
    this.$element = element!;
    this.$key = propsToKey(serviceType as any, props);
    props && serviceType.$attachService(element);
    props && serviceType.$attachServiceState(element, props, null);
  }

  /**
   * Lazy loads code through QRL and invokes it.
   *
   * This method can be used inside services to avoid loading the implementation of methods until
   * they are required.
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
   * @param qrl - QRL to the function to lazy load and execute.
   * @param args - arguments to pass to the QRL function.
   * @returns a Promise of the value returned from the invoked function.
   */
  async $invokeQRL<ARGS extends any[], RET>(
    qrl: QRL<(...args: ARGS) => RET>,
    ...args: ARGS
  ): Promise<RET> {
    const service = getServiceType(this);
    const delegate = await qImport((service as any as typeof Service).$config, qrl);
    return getInjector(this.$element).invoke(delegate as any, this, ...args);
  }

  /**
   * Invoked during hydration if state is not provide or can't be rehydrated from HTML/DOM.
   *
   * Lifecycle order:
   * - `new Service(...)`
   * - `$newState(props)`: Invoked if no serialized state found in DOM.
   * - `$init()`
   * - Service instance returned by the `Injector`.
   *
   * ```
   * class MyService extends Service<MyServiceProps, MyServiceState> {
   *   $qrl = QRL`./path/to/service/MyService`;
   *   $type = 'myService';
   *   $keyProps = ['project', 'task'];
   *
   *   async $newState(props: MyServiceProps): Promise<string> {
   *     // either compute new state OR call to the backend to retrieve it.
   *     return state;
   *   }
   * }
   * ```
   *
   * @param props - the `ServiceProps` that identify the new instance of the service.
   */
  $newState(keyProps: PROPS): Promise<STATE> {
    const serviceType = this.constructor as ServiceConstructor<any>;
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
   * - Service instance returned by the `Injector`.
   */
  async $init() {}

  /**
   * Release the service.
   *
   * Releasing service means that the transient service instance is released from memory and it
   * becomes eligible for garbage collection. It also removes the service state
   * from its associated element in the HTML/DOM.
   *
   * Releasing a service does not imply that the state should be deleted on the backend.
   */
  $release(): void {
    const injector = getInjector(this.$element);
    const serviceType = getServiceType(this);
    const key = propsToKey(serviceType, this.$props);
    injector.releaseService(key);
  }
}

/**
 * Retrieve the `ServiceConstructor<SERVICE>` from the `Service`
 * @param service
 * @returns
 * @internal
 */
function getServiceType<SERVICE extends Service<any, any>>(
  service: SERVICE
): ServiceConstructor<SERVICE> {
  if (!(service instanceof Service)) {
    throw qError(QError.Service_expected_obj, service);
  }
  const serviceType = service.constructor as any as ServiceConstructor<SERVICE>;
  if (serviceType.$attachServiceState !== Service.$attachServiceState) {
    throw qError(QError.Service_overridesConstructor_service, service);
  }
  return serviceType;
}

/**
 * Returns `State` type of `Service`.
 *
 * Given:
 * ```
 * class MyService extends Service<MyProps, MyState> {
 *   ...
 * }
 *
 * const myService: MyService = ...;
 * ```
 * Then `ServiceStateOf<MyService>` returns `MyState`.
 * @public
 */
export type ServiceStateOf<SERVICE extends Service<any, any>> = SERVICE extends Service<
  any,
  infer STATE
>
  ? STATE
  : never;

/**
 * Returns `Props` type of `Service`.
 *
 * Given:
 * ```
 * class MyService extends Service<MyProps, MyState> {
 *   ...
 * }
 *
 * const myService: MyService = ...;
 * ```
 * Then `ServicePropsOf<MyService>` returns `MyProps`.
 * @public
 */
export type ServicePropsOf<SERVICE extends Service<any, any>> = SERVICE extends Service<
  infer PROPS,
  any
>
  ? PROPS
  : never;

/**
 * `Promise` which resolves to a `Service` instance but is extended with its `ServiceKey`.
 *
 * @public
 */
export interface ServicePromise<SERVICE extends Service<any, any>> extends Promise<SERVICE> {
  /**
   * The `ServiceKey` associated with the current `Service` instance.
   *
   * Normally one can retrieve `$key` from a `Service` instance. In the case of the `Promise`
   * it may not be convenient to wait for the `Promise` to resolve, in which case retrieving
   * `$key` synchronously is more convenient.
   */
  $key: ServiceKey<SERVICE>;
}

/**
 * @internal
 */
export function isService(value: any): value is Service<any, any> {
  return Object.prototype.hasOwnProperty.call(value, '$key');
}

/**
 * Service Constructor.
 * @public
 */
export interface ServiceConstructor<SERVICE extends Service<any, any> = any> {
  /**
   * A service name.
   *
   * All service instances of this type have this name.
   *
   * When services are serialized each service instance needs to have a unique name, which is a
   * combination of its `$type` name and its `Props` values, the keys of which are defined in `$keyProps`.
   *
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
  readonly $type: string;

  /**
   * The QRL location of this Service type.
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
  readonly $qrl: QRL;

  /**
   * Order of properties in `Props` which define the service key.
   *
   * A service is uniquely identified by a key such as `myService:123:456`. The key consists
   * of `myService` which associates the key with a specific service.
   *
   * For example:
   *
   * ```
   * <div ::myService="./path/to/service/MyService"
   *      myService:123:456="{completed: false, text: 'sample task'}">
   * ```
   *
   * The key `myService:123:456` is associated with `myService` which is declared in `::myService`
   * attribute. The `123:456` are property values. In order for the key to be converted into
   * `Props` it is necessary to know what each of the values point to. `$keyProps` stores that
   * information.
   *
   * For example a service defined like so:
   *
   * ```
   * class MyService extends Service<MyServiceProps, MyServiceState> {
   *   $qrl = QRL`./path/to/service/MyService`;
   *   $type = 'myService';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * Would result it `myService:123:456` to be convert to a `Props` of
   * `{project: '123', task: '456'}`. Notice that the `$keyProps` define
   * property names for the key value positions.
   */
  readonly $keyProps: string[];

  /**
   * Attach QRL definition of the `Service` to an `Element`.
   *
   * Attaching a service to an `Element` means that an attribute with the service name (`$type`) is left
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
   *
   * will result in:
   *
   * ```
   * <div ::my-service="somePath/MyService">
   * ```
   *
   * @param element - Element where the service definition should be attached.
   */
  $attachService<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element
  ): void;

  /**
   * Attach service instance state to an `Element`.
   *
   * Attaching a service state to an `Element` means that the service `Props` are serialized into
   * service instance key and service `State` is serialized into the service value.
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
   *
   * will result in:
   *
   * ```
   * <div ::my-service="somePath/MyService"
   *      my-service:123="{text: 'some text'}">
   * ```
   *
   * @param element - Element where the service definition should be attached.
   */
  $attachServiceState<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    host: Element,
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey,
    state: ServiceStateOf<SERVICE> | null
  ): void;

  /**
   * Re-hydrate a service instance.
   *
   * Re-hydration is the process of retrieving or creating a transitive instance of a service
   * based on a service `key`.
   *
   * There are these possible scenarios:
   * - `MyService.$hydrate(element, props, state)`:
   *   Create new service (overriding any serialized `State` with the new `state`).
   * - `MyService.$hydrate(element, props)`: compute the service `key` from props:
   *   - If `State` exists in the HTML/DOM for the `key`, use that.
   *   - If no `State` exists in HTML/DOM for the `key` invoke `Service.$newState()`.
   *     - Possibly throw an error.
   *
   * @param element - Element to which the service should be (or is) attached.
   * @param propsOrKey - Service key either serialized to a string or in `Props` format.
   * @param state - Optional new state for the service instance.
   * @returns `ServicePromise` which contains the `$key` property for synchronous retrieval.
   */
  $hydrate<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element,
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey,
    state?: ServiceStateOf<SERVICE>
  ): ServicePromise<SERVICE>;

  /**
   * Converts a serialized `ServiceKey` into `ServiceProps`.
   *
   * A `ServiceKey` is formatted as: `<serviceName>:<value1>:<value2>:...`.
   *
   * The purpose of the keys is to be globally unique identifiers in the application
   * so that service instances can be identified. The keys are string representations
   * because it is important to be able to serialize the keys to HTML.
   *
   * Service instances prefer to have a parsed version of the key as `ServiceProps`.
   * A `ServiceKey` contains values only, `ServiceProps` are key/value pairs. This function uses
   * `Service.$keyProps` to identify with which property each value should be associated with.
   *
   * @param key - the serialized `ServiceKey` to parse to `ServiceProps`.
   * @returns the parsed `ServiceProps`.
   */
  $keyToProps<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    key: ServiceKey<SERVICE>
  ): ServicePropsOf<SERVICE>;

  /**
   * Serialize `ServiceProps` into a `ServiceKey` string.
   *
   * A `ServiceKey` is formatted as: `<serviceName>:<value1>:<value2>:...`.
   *
   * The purpose of the keys is to be globally unique identifiers in the application
   * so that service instances can be identified. The keys are string representations
   * because it is important to be able to serialize the keys to HTML.
   *
   * Service instances prefer to have a parsed version of the key as `ServiceProps`.
   * A `ServiceKey` contains values only, `ServiceProps` are key/value pairs. This function uses
   * `Service.$keyProps` to identify with which property each value should be associated with.
   *
   * @param props - the parsed `ServiceProps` to serialize.
   * @returns the serialized `ServiceKey`.
   */
  $propsToKey<SERVICE extends Service<any, any>>(
    this: { new (...args: any[]): SERVICE },
    props: ServicePropsOf<SERVICE>
  ): ServiceKey;

  new (
    hostElement: Element,
    props: any, // TODO: should be: ServicePropsOf<SERVICE>,
    state: any // TODO: should be: ServiceStateOf<SERVICE> | null
  ): SERVICE;
}
