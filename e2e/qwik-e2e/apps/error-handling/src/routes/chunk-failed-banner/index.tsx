import { component$, Catch, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { CatchThrowOnClick, defaultFallback } from '../../components/catch/catch';

const markPageOnFailedChunk = `
document.addEventListener('qerror', (event) => {
  if (event.detail.importError) {
    document.documentElement.setAttribute('data-chunk-failed', '');
  }
});
`;

const bannerStyles = `
.chunk-failed {
  display: none;
}
[data-chunk-failed] .chunk-failed {
  display: block;
}
`;

const ChunkFailedContent = component$(() => {
  const clicks = useSignal(0);
  const visibleTaskRuns = useSignal(0);
  useVisibleTask$(() => {
    visibleTaskRuns.value++;
  });
  return (
    <section id="catch-content">
      <button id="chunk-failed-click" onClick$={() => clicks.value++}>
        Click
      </button>
      <span id="chunk-failed-clicks">{clicks.value}</span>
      <span id="chunk-failed-visible-task-runs">{visibleTaskRuns.value}</span>
    </section>
  );
});

export default component$(() => (
  <>
    <script dangerouslySetInnerHTML={markPageOnFailedChunk} />
    <style dangerouslySetInnerHTML={bannerStyles} />
    <p id="chunk-failed-banner" class="chunk-failed" role="alert">
      Part of this page could not load. Reload to try again.
    </p>
    <Catch fallback$={defaultFallback}>
      <ChunkFailedContent />
      <CatchThrowOnClick idPrefix="chunk-failed" message="handler boom" />
    </Catch>
  </>
));
