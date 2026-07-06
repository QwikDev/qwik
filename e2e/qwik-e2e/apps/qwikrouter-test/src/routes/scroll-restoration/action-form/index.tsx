import { component$, useStylesScoped$ } from '@qwik.dev/core';
import { Form, routeAction$ } from '@qwik.dev/router';

export const useScrollAction = routeAction$((form) => {
  return {
    submitted: form.value,
  };
});

export default component$(() => {
  const action = useScrollAction();

  useStylesScoped$(`
    .spacer {
      height: 900px;
    }

    .tail {
      height: 1400px;
    }
  `);

  return (
    <main>
      <h1 id="scroll-action-heading">Action Scroll</h1>
      <div class="spacer" />
      <Form action={action} id="scroll-action-form">
        <input type="hidden" name="value" value="keep-scroll" />
        <button id="scroll-action-submit">Submit Action</button>
      </Form>
      <p id="scroll-action-result">
        {action.value?.submitted ? `submitted: ${action.value.submitted}` : 'idle'}
      </p>
      <div class="tail" />
    </main>
  );
});
