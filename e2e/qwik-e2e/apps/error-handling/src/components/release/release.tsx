import { component$, isServer, useServerData, type JSXOutput } from '@qwik.dev/core';
import { releaseGated } from '../../../../../utils/release-gate';

// Raw inline onclick for manual testing while the stream is held, unless CSP forbids it.
// Automated tests release the gate via its HTTP endpoint instead.
export const ReleaseButton = component$<{
  requestId: string;
  releaseId: string | null;
  label: string;
}>(({ requestId, releaseId, label }) => {
  const nonce = useServerData<string>('nonce');
  if (!releaseId) {
    return null;
  }
  const releaseUrl = `/__ooos-release/${encodeURIComponent(requestId)}/${encodeURIComponent(
    releaseId
  )}`;
  const onclick = nonce
    ? ''
    : ` onclick="fetch(this.getAttribute('data-release-url'),{method:'POST'})"`;
  const html = `<button id="catch-release" data-release-url="${releaseUrl}"${onclick}>${label}</button>`;
  return <span dangerouslySetInnerHTML={html} />;
});

export const CatchGatedOk = component$<{ requestId: string; releaseId: string | null }>(
  ({ requestId, releaseId }) => {
    if (isServer) {
      return releaseGated(requestId, releaseId, () => (
        <span id="catch-deferred-ok">deferred ok</span>
      )) as unknown as JSXOutput;
    }
    return <span id="catch-deferred-ok">deferred ok</span>;
  }
);
