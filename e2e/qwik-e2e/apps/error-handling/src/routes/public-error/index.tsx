import { $, component$, ErrorBoundary, isServer, PublicError, useSignal } from '@qwik.dev/core';
import { EbFallback, EbSyncThrower, errMsg } from '../../components/error-boundary/error-boundary';

const EbPublicThrower = component$(() => {
  if (isServer) {
    throw new PublicError({ message: 'Out of stock', sku: 'A1' });
  }
  return <span id="eb-public-client" />;
});

const EbPublicProbe = component$<{ error: unknown }>((props) => {
  const kind = useSignal('');
  return (
    <>
      <button
        id="eb-public-probe"
        onClick$={() => {
          kind.value =
            props.error instanceof PublicError
              ? `public:${(props.error.data as { sku: string }).sku}`
              : 'plain';
        }}
      >
        probe
      </button>
      <span id="eb-public-kind">{kind.value}</span>
    </>
  );
});

const publicFallback = $((e: unknown) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <EbPublicProbe error={e} />
  </section>
));

export default component$(() => (
  <>
    <ErrorBoundary fallback$={publicFallback}>
      <EbPublicThrower />
    </ErrorBoundary>
    <ErrorBoundary fallback$={(e) => <EbFallback id="eb-plain" msg={errMsg(e)} />}>
      <EbSyncThrower clientId="eb-plain-client" />
    </ErrorBoundary>
  </>
));
