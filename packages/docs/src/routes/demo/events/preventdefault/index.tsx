import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <a
      href="/docs"
      preventdefault:click // This will prevent the default behavior of the "click" event.
      onClick$={() => {
        // event.PreventDefault() will not work here, because handler is dispatched asynchronously.
        alert('Do something else to simulate navigation...');
      }}
    >
      Go to docs page
    </a>
  );
});
