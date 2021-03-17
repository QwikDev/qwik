/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Injector } from '../injection/types.js';
import { QRL } from '../import/types.js';

export interface ServiceType<SERVICE extends IService<any, any>> {
  readonly $name: string;
  readonly $qrl: QRL;
  readonly $keyProps: string[];

  $attachService(host: Element): void;
  $attachServiceState(
    host: Element,
    props: Readonly<PropsOf<SERVICE>>,
    state: StateOf<SERVICE> | null
  ): void;
  $hydrate(
    element: Element,
    props: PropsOf<SERVICE>,
    state?: StateOf<SERVICE>
  ): ServicePromise<SERVICE>;
  new (injector: Injector, state: StateOf<SERVICE>): SERVICE;
}

export type IService<PROPS, STATE> = {
  readonly $injector: Injector;
  readonly $props: PROPS;
  readonly $state: STATE;
  readonly $key: string;

  $invokeQRL<ARGS extends any[], RET>(
    qrl: QRL<(...args: ARGS) => RET>,
    ...args: ARGS
  ): Promise<RET>;
  $materializeState(props: PROPS): Promise<STATE>;
  $release(): void;
};

export type ServiceOf<SERVICE_TYPE extends ServiceType<any>> = SERVICE_TYPE extends ServiceType<
  infer SERVICE
>
  ? SERVICE
  : never;

export type StateOf<SERVICE extends IService<any, any>> = SERVICE extends IService<any, infer STATE>
  ? STATE
  : never;

export type PropsOf<SERVICE extends IService<any, any>> = SERVICE extends IService<infer PROPS, any>
  ? PROPS
  : never;

export interface ServicePromise<T> extends Promise<T> {
  $key: string;
}

/**
 * String representation of the service key.
 */
export type Key = string;

export function isService(value: any): value is IService<any, any> {
  return Object.prototype.hasOwnProperty.call(value, '$key');
}
