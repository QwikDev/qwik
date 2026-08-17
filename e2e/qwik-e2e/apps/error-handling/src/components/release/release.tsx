import { component$, isServer, type JSXOutput } from '@qwik.dev/core';
import { releaseGated } from '../../../../../utils/release-gate';

// Raw inline onclick on purpose: the held stream means no framework JS has loaded yet.
export const ReleaseButton = component$<{
  requestId: string;
  releaseId: string | null;
  label: string;
}>(({ requestId, releaseId, label }) => {
  if (!releaseId) {
    return null;
  }
  const releaseUrl = `/__ooos-release/${encodeURIComponent(requestId)}/${encodeURIComponent(
    releaseId
  )}`;
  const html = `<button id="eb-release" data-release-url="${releaseUrl}" onclick="fetch(this.getAttribute('data-release-url'),{method:'POST'})">${label}</button>`;
  return <span dangerouslySetInnerHTML={html} />;
});

export const EbGatedOk = component$<{ requestId: string; releaseId: string | null }>(
  ({ requestId, releaseId }) => {
    if (isServer) {
      return releaseGated(requestId, releaseId, () => (
        <span id="eb-deferred-ok">deferred ok</span>
      )) as unknown as JSXOutput;
    }
    return <span id="eb-deferred-ok">deferred ok</span>;
  }
);
