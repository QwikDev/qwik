import { component$, ErrorBoundary, isServer, PublicError } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

const EbUnserializablePublicThrower = component$(() => {
  if (isServer) {
    throw new PublicError({ message: 'Out of stock', notSerializable: () => 42 });
  }
  return <span id="eb-public-client" />;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbUnserializablePublicThrower />
  </ErrorBoundary>
));
