import { component$, Catch, Resource, useResource$, useSignal } from '@qwik.dev/core';
import { CatchFallback, errMsg } from '../../components/catch/catch';

const EmbeddedFragment = component$(() => {
  const fragmentHtml = useResource$<string>(async () => {
    const url = `http://localhost:${(globalThis as any).PORT}/error-handling-fragment/`;
    const res = await fetch(url);
    return res.text();
  });
  return (
    <Resource
      value={fragmentHtml}
      onResolved={(html) => <div id="catch-embed" dangerouslySetInnerHTML={html} />}
    />
  );
});

export default component$(() => {
  const touched = useSignal(0);
  return (
    <>
      <Catch fallback$={(e) => <CatchFallback id="catch-host-fb" msg={errMsg(e)} />}>
        <section id="catch-host-content">
          <p>host content</p>
          <button id="catch-host-button" onClick$={() => touched.value++}>
            Touch host
          </button>
          <span id="catch-host-count">{touched.value}</span>
        </section>
      </Catch>
      <EmbeddedFragment />
    </>
  );
});
