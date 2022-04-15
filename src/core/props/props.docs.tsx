//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { component$ } from '@builder.io/qwik';

export const MyApp = component$(() => {
  return (
    <div>
      <Greeter name="World" />
    </div>
  );
});

export const Greeter = component$((props: { salutation?: string; name?: string }) => {
  return (
    <span>
      {props.salutation || 'Hello'} <b>{props.name || 'World'}</b>
    </span>
  );
});
