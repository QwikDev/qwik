/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { GreeterComponent } from './Greeter_component.js';
import { injectMethod, h, QRL } from '@builder.io/qwik';

/**
 * @fileoverview
 *
 * Contains rendering information of the Greeter component.
 */

/**
 * Render template method of `GreeterComponent`.
 *
 * - `inject` is used to get (lazy-load) information needed for rendering.
 *   - `GreeterComponent` is located and or created and injectEventHandler as `this` of the template method.
 */
export default injectMethod(GreeterComponent, function (this: GreeterComponent) {
  const name = this.$state.name;
  return (
    <div>
      <div>
        Your name:
        <input
          value={name}
          // - Declare a listener on `input` to invoke `Greeter_onKeyup.ts`
          // - The `value` should be set to the `event.target.value` property.
          //   - See `provideQrlExp` in `Greeter_onKeyup.ts` for details.
          on:keyup={QRL`./Greeter_input_onKeyup#?name=.target.value`}
        />
      </div>
      <span>Hello {name}!</span>
    </div>
  );
});
