import { component$, sync$ } from '@qwik.dev/core';

export default component$(() => (
  <section class="fixture" data-fixture="sync/sync">
    <h2>sync</h2>
    <button
      data-testid="trigger"
      onClick$={sync$((_: Event, button: HTMLButtonElement) => {
        const result = button.nextElementSibling!;
        result.textContent = 'done';
        result.setAttribute('data-done', '');
      })}
    >
      Run
    </button>
    <output data-testid="result" />
  </section>
));
