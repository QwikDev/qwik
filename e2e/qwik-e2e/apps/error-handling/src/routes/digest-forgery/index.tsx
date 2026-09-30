import { $, component$, Catch, isServer } from '@qwik.dev/core';
import { errMsg } from '../../components/catch/catch';

const CatchForgedDigestThrower = component$(() => {
  if (isServer) {
    const err = new Error('digest secret boom') as Error & { digest?: string };
    err.digest = 'forged-digest';
    throw err;
  }
  return <span id="catch-thrower-client" />;
});

const digestFallback = $((e: Error & { digest?: string }) => (
  <section id="catch-fallback">
    <p id="catch-fallback-msg">caught: {errMsg(e)}</p>
    <span id="catch-fallback-digest">{e.digest ?? 'none'}</span>
  </section>
));

export default component$(() => (
  <Catch fallback$={digestFallback}>
    <CatchForgedDigestThrower />
  </Catch>
));
