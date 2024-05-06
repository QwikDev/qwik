import { component$, sync$, $ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <a
      href="/"
      onClick$={[
        sync$((event: MouseEvent): void => {
          if (event.ctrlKey) {
            event.preventDefault();
          }
        }),
        $(() => {
          console.log('clicked');
        }),
      ]}
    >
      click me!
    </a>
  );
});
