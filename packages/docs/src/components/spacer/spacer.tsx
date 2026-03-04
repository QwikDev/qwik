import { type PropsOf, component$ } from '@qwik.dev/core';

export const Spacer = component$((props: PropsOf<'div'>) => {
  return <div {...props} data-spacer aria-hidden="true" role="presentation" />;
});
