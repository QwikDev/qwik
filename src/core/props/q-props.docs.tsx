//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { Fragment, h, qComponent, qHook } from '@builder.io/qwik';

export const MyApp = qComponent({
  onRender: qHook(() => (
    <div>
      <Greeter name="World" />
    </div>
  )),
});

export const Greeter = qComponent<{ salutation?: string; name?: string }>({
  onRender: qHook((props) => (
    <span>
      {props.salutation || 'Hello'} <b>{props.name || 'World'}</b>
    </span>
  )),
});
