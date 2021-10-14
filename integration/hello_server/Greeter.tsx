/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { qComponent, qHook, h, useEvent } from '@builder.io/qwik';

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
 * import { Greeter } from './hello_world';
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
export const Greeter = qComponent<GreeterProps>({
  onRender: qHook((props) => (
    <div>
      <div>
        Your name:
        <input
          value={props.name}
          // - Declare a listener on `input` to invoke `Greeter_onKeyup.ts`
          // - The `value` should be set to the `event.target.value` property.
          //   - See `provideQrlExp` in `Greeter_onKeyup.ts` for details.
          on:keyup={qHook<typeof Greeter>(
            (props) => (props.name = (useEvent<KeyboardEvent>().target as HTMLInputElement).value)
          )}
        />
      </div>
      <span>Hello {props.name}!</span>
    </div>
  )),
});
