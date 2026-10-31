import { component$ } from '@qwik.dev/core';
import { Form, routeAction$, routeLoader$ } from '@qwik.dev/router';

export const useTarget = routeLoader$(({ originalUrl, url }) => ({
  original: originalUrl.pathname,
  served: url.pathname,
}));

export const useSubmit = routeAction$(() => ({ done: true }));

export default component$(() => {
  const target = useTarget();
  const submit = useSubmit();
  return (
    <>
      <h1 id="rewrite-spa-target">rewrite spa: target</h1>
      <p id="rewrite-spa-original">{target.value.original}</p>
      <p id="rewrite-spa-served">{target.value.served}</p>
      <Form action={submit}>
        <button type="submit" id="rewrite-spa-submit">
          submit
        </button>
      </Form>
      {submit.value?.done && <p id="rewrite-spa-action-done">action done</p>}
    </>
  );
});
