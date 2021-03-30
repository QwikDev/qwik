/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL } from '../import/types.js';

/**
 * Type representing constructor of a Service
 */
export interface ServiceType<SERVICE extends IService<any, any>> {
  readonly $type: string;
  readonly $qrl: QRL;
  readonly $keyProps: string[];

  $attachService(host: Element): void;
  $attachServiceState(
    host: Element,
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey,
    state: ServiceStateOf<SERVICE> | null
  ): void;
  $hydrate(
    element: Element,
    propsOrKey: ServicePropsOf<SERVICE> | ServiceKey,
    state?: ServiceStateOf<SERVICE>
  ): ServicePromise<SERVICE>;
  $keyToProps(key: ServiceKey): ServicePropsOf<SERVICE>;
  $propsToKey(props: ServicePropsOf<SERVICE>): ServiceKey;
  new (
    element: Element,
    props: ServicePropsOf<SERVICE>,
    state: ServiceStateOf<SERVICE> | null
  ): SERVICE;
}

/**
 * Type representing Service instance. See `Service` for details.
 */
export type IService<PROPS, STATE> = {
  readonly $element: Element;
  readonly $props: PROPS;
  readonly $state: STATE;
  readonly $key: string;

  $invokeQRL<ARGS extends any[], RET>(
    qrl: QRL<(...args: ARGS) => RET>,
    ...args: ARGS
  ): Promise<RET>;
  $newState(props: PROPS): Promise<STATE>;
  $init(): Promise<void> | void;
  $release(): void;
};

export type ServiceOf<SERVICE_TYPE extends ServiceType<any>> = SERVICE_TYPE extends ServiceType<
  infer SERVICE
>
  ? SERVICE
  : never;

export type ServiceStateOf<SERVICE extends IService<any, any>> = SERVICE extends IService<
  any,
  infer STATE
>
  ? STATE
  : never;

export type ServicePropsOf<SERVICE extends IService<any, any>> = SERVICE extends IService<
  infer PROPS,
  any
>
  ? PROPS
  : never;

export interface ServicePromise<T> extends Promise<T> {
  $key: string;
}

/**
 * String representation of the service key.
 *
 * A service is uniquely identified by its props. Props is an object of key/value pairs which is
 * used to look up the service. When referring to service in DOM it is necessary to serialize the
 * Props into a unique strings which is a valid DOM attribute. To do that the Prop values are
 * concatenated into a `ServiceKey` like so `<service_name>:<value1>:<value2>:...`. The order
 * of values is determined by the `Service.$keyProps` property.
 *
 * When Service is working with the Props it is more connivent to use the deserialized version of
 * the `ServiceKey` which is Props.
 *
 * See: `Service.$keyProps`
 *
 * Example:
 *
 * ```
 * interface MyProps {
 *   id: string;
 * }
 *
 * class MyService extends Service<MyProps, {}> {
 *   $qrl = QRL`./path/to/service/MyService`;
 *   $type = 'myService';
 *   $keyProps = ['id'];
 * }
 *
 * expect(MyService.$propsToKey({id: 123})).toEqual('my-service:123');
 * expect(MyService.$keyToProps('my-service:123')).toEqual({id: 123});
 * ```
 *
 * @public
 */
export type ServiceKey = string;

/**
 * @internal
 */
export function isService(value: any): value is IService<any, any> {
  return Object.prototype.hasOwnProperty.call(value, '$key');
}
