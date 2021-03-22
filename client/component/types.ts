/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL } from '../import/types.js';

export interface IComponent<PROPS, STATE> {
  $host: Element;
  $state: STATE;
  $props: PROPS;
  $materializeState(props: PROPS): Promise<STATE> | STATE;
}

export interface ComponentType<COMP extends IComponent<any, any>> {
  $templateQRL: QRL;
  new (element: Element, props: ComponentPropsOf<COMP>, state: ComponentStateOf<COMP> | null): COMP;
}

export interface QProps {
  [key: string]: string | QRL;
}

export type ComponentStateOf<SERVICE extends IComponent<any, any>> = SERVICE extends IComponent<
  any,
  infer STATE
>
  ? STATE
  : never;

export type ComponentPropsOf<SERVICE extends IComponent<any, any>> = SERVICE extends IComponent<
  infer PROPS,
  any
>
  ? PROPS
  : never;
