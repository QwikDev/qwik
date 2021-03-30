/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { GreeterProps } from './public.js';
import { Component, QRL } from '../qoot.js';

/**
 * @fileoverview
 *
 * Declares the Greeter component.
 */

/**
 * The serialize state of the component.
 *
 * When component is executed on server it creates component state.
 * The component state needs to be serialized into DOM and sent over to the client.
 */
export interface GreeterState {
  name: string;
}

/**
 * Transient instance of the component.
 *
 * The component instance is transient because it can have references to other
 * non-serializable objects. Component has shared behavior.
 */
export class GreeterComponent extends Component<GreeterProps, GreeterState> {
  static $templateQRL = QRL`./Greeter/template`;
  // Inherited properties from `Component`
  // $host: Element;
  // $state: GreeterState;
  // $keyProps: GreeterProps;

  /**
   * Method to create initial state if no state can be found in the DOM under the
   * `:.` attribute.
   *
   * @param props Component properties.
   */
  $newState(props: GreeterProps): GreeterState {
    // In this example the `GreeterState` is initialized from the `GreeterProps`.
    return { name: props.name };
  }
}
