/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL } from '../import/types.js';

// TODO: docs
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
 */
export type ServiceKey = string;

export function isService(value: any): value is IService<any, any> {
  return Object.prototype.hasOwnProperty.call(value, '$key');
}
