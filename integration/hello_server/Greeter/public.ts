/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxDeclareComponent, QRL } from '../qoot.js';

/**
 * @fileoverview
 *
 * The purpose of this file is to break symbolic dependency between the use of
 * `<Greeter>` with the rendering details of `<greeter>`.
 */

/**
 * Greeter Props
 *
 * This interface defines the public interface for the component. The interface
 * defines which properties the component accepts in template declarations.
 *
 * ```
 *   <greeter name="World">
 * ```
 */
export interface GreeterProps {
  name: string;
}

/**
 * Declares the public component `<Greeter>` to be used in parent component.
 *
 * Usage:
 * ```
 * import {Greeter} from './hello_world.js';
 * ...
 *
 * function () {
 *   render (
 *     <div><Greeter name="World"/></div>
 *   );
 * }
 *
 * ```
 */
export const Greeter = jsxDeclareComponent<GreeterProps>(
  /**
   * Name of the DOM host element which will be created for this component.
   */
  'greeter',
  /**
   * QRL import of where the rendering template is located.
   *
   * This QRL is the only connection between the public usage of `<Greeter>`
   * and the rendering template. The separation is important so that the parent
   * component can hydrate and re-render, without causing the child component to
   * hydrate and re-render.
   */
  QRL`./Greeter/template`
);
