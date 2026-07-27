import { component$, ErrorBoundary, Resource, useResource$, useSignal } from '@qwik.dev/core';
import { EbFallback, errMsg } from '../../components/error-boundary/error-boundary';

// Inlined during SSR so the qErr swap script runs with a real currentScript.
// A router app cannot serve a `containerTagName:'container'` fragment, so the
// separate embedded container is still sourced from the plain e2e fragment endpoint.
const EmbeddedFragment = component$(() => {
  const fragmentHtml = useResource$<string>(async () => {
    const url = `http://localhost:${(globalThis as any).PORT}/e2e/error-boundary-streaming?fragment&loader=false&outOfOrder=false`;
    const res = await fetch(url);
    return res.text();
  });
  return (
    <Resource
      value={fragmentHtml}
      onResolved={(html) => <div id="eb-embed" dangerouslySetInnerHTML={html} />}
    />
  );
});

export default component$(() => {
  const touched = useSignal(0);
  return (
    <>
      <ErrorBoundary fallback$={(e) => <EbFallback id="eb-host-fb" msg={errMsg(e)} />}>
        <section id="eb-host-content">
          <p>host content</p>
          <button id="eb-host-button" onClick$={() => touched.value++}>
            Touch host
          </button>
          <span id="eb-host-count">{touched.value}</span>
        </section>
      </ErrorBoundary>
      <EmbeddedFragment />
    </>
  );
});
