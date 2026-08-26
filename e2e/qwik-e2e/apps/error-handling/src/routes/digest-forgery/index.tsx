import { $, component$, ErrorBoundary, isServer } from '@qwik.dev/core';
import { errMsg } from '../../components/error-boundary/error-boundary';

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
