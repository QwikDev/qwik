/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { h, Fragment, QRL, injectMethod } from '@builder.io/qwik';
import { HeaderComponent } from './Header_component';

export default injectMethod(
  HeaderComponent, //
  function (this: HeaderComponent) {
    return (
      <>
        <h1>todos</h1>
        <input
          class="new-todo"
          placeholder="What needs to be done?"
          autofocus
          value={this.$state.text}
          on:keyup={QRL`ui:/Header_addTodo#?value=.target.value&code=.code`}
        />
      </>
    );
  }
);
