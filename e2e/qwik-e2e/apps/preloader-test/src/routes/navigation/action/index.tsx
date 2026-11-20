import { component$ } from '@qwik.dev/core';
import { Form, routeAction$, type DocumentHead } from '@qwik.dev/router';

export const useDouble = routeAction$((data) => ({ value: Number(data.value) * 2 }));

export default component$(() => {
  const action = useDouble();
  return (
    <section class="fixture" data-fixture="navigation/action">
      <h2>form action</h2>
      <Form action={action}>
        <input type="hidden" name="value" value="21" />
        <button data-testid="trigger" type="submit">
          Submit
        </button>
      </Form>
      <output data-testid="result" data-done={action.value ? '' : undefined}>
        {action.value?.value}
      </output>
    </section>
  );
});

export const head: DocumentHead = { title: 'form action' };
