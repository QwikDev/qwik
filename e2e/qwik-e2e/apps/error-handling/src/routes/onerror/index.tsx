import { component$, Catch } from '@qwik.dev/core';
import { defaultFallback, CatchThrowOnClick } from '../../components/catch/catch';

export default component$(() => (
  <Catch
    fallback$={defaultFallback}
    onError$={(e, info) => {
      (window as any).__catchOnErrorRuns = ((window as any).__catchOnErrorRuns ?? 0) + 1;
      (window as any).__catchOnErrorMsg = (e as any)?.message ?? String(e);
      (window as any).__catchOnErrorPhase = info?.phase;
      (window as any).__catchOnCatchId = info?.boundaryId;
    }}
  >
    <CatchThrowOnClick idPrefix="catch-onerror" message="onerror boom" />
    <div id="catch-content">content ok</div>
  </Catch>
));
