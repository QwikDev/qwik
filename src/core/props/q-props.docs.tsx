//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { Fragment, h, onRender, qComponent } from '@builder.io/qwik';

export const MyApp = qComponent(() => {
  return onRender(() => (
    <div>
      <Greeter name="World" />
    </div>
  ));
});

export const Greeter = qComponent((props: { salutation?: string; name?: string }) => {
  return onRender(() => (
    <span>
      {props.salutation || 'Hello'} <b>{props.name || 'World'}</b>
    </span>
  ));
});
