import { $, component$, ErrorBoundary, isServer } from '@qwik.dev/core';
// Relative (not `~`) so the prod twin can re-export this module across app roots.
import { errMsg } from '../../components/error-boundary/error-boundary';

// A forged `digest` must NOT buy redaction pass-through: prod still redacts the secret.
const EbForgedDigestThrower = component$(() => {
  if (isServer) {
    const err = new Error('digest secret boom') as Error & { digest?: string };
    err.digest = 'forged-digest';
    throw err;
  }
  return <span id="eb-thrower-client" />;
});

const digestFallback = $((e: Error & { digest?: string }) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <span id="eb-fallback-digest">{e.digest ?? 'none'}</span>
  </section>
));

export default component$(() => (
  <ErrorBoundary fallback$={digestFallback}>
    <EbForgedDigestThrower />
  </ErrorBoundary>
));
