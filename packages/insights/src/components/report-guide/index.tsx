import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { reportGuides, type ReportGuideId } from './guides';
import { readGuidePreference, saveGuidePreference } from './preference';

export default component$<{ report: ReportGuideId }>(({ report }) => {
  const isOpen = useSignal(false);
  const isReady = useSignal(false);
  const guide = reportGuides[report];
  // eslint-disable-next-line qwik/no-use-visible-task -- Restore the browser-only disclosure preference.
  useVisibleTask$(
    ({ track }) => {
      const reportId = track(() => report);
      try {
        isOpen.value = readGuidePreference(localStorage, reportId);
      } catch {
        isOpen.value = false;
      }
      isReady.value = true;
    },
    { strategy: 'document-ready' }
  );

  return (
    <details
      class="my-editorial-6 rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-4 text-editorial-12"
      open={isOpen.value}
      onToggle$={(_, element) => {
        isOpen.value = element.open;
        if (isReady.value) {
          try {
            saveGuidePreference(localStorage, report, element.open);
          } catch {
            // Storage access can itself be blocked by the browser.
          }
        }
      }}
    >
      <summary class="cursor-pointer font-semibold text-editorial-link focus-visible:outline-2 focus-visible:outline-editorial-accent">
        How to use this report
      </summary>
      <p class="mt-editorial-4 font-semibold">{guide.purpose}</p>
      <ol class="my-editorial-4 list-decimal space-y-editorial-2 pl-editorial-5 text-editorial-secondary">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>
        <strong>Reading the data: </strong>
        {guide.meaning}
      </p>
      <p class="mt-editorial-3 text-editorial-secondary">
        <strong>Keep in mind: </strong>
        {guide.caution}
      </p>
    </details>
  );
});
