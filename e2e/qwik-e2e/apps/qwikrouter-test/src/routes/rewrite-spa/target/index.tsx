import { component$ } from '@qwik.dev/core';
import { Form, Link, routeAction$, routeLoader$ } from '@qwik.dev/router';

export const useTarget = routeLoader$(({ originalUrl, url }) => ({
  original: originalUrl.pathname,
  served: url.pathname,
}));

/** Not read during SSR, so the client fetches it on first read. */
export const useLazy = routeLoader$(({ originalUrl }) => originalUrl.pathname);

export const useSubmit = routeAction$(() => ({ done: true }));

export default component$(() => {
  const target = useTarget();
  const lazy = useLazy();
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
      <button
        id="rewrite-spa-submit-js"
        onClick$={() => {
          (window as any).__submitOutcome = 'pending';
          submit.submit().then(
            () => ((window as any).__submitOutcome = 'resolved'),
            () => ((window as any).__submitOutcome = 'rejected')
          );
        }}
      >
        submit from code
      </button>
      <button
        id="rewrite-spa-read-lazy"
        onClick$={() => {
          document.getElementById('rewrite-spa-lazy')!.textContent = lazy.value;
        }}
      >
        read lazy loader
      </button>
      <p id="rewrite-spa-lazy"></p>
      <Link href="/qwikrouter-test/rewrite-spa/" id="rewrite-spa-back">
        back
      </Link>
    </>
  );
});
