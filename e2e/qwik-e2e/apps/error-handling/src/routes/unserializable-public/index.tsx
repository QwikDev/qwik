import { component$, ErrorBoundary, isServer, PublicError } from '@qwik.dev/core';
// Relative (not `~`) so the prod twin can re-export this module across app roots.
import { defaultFallback } from '../../components/error-boundary/error-boundary';

// PublicError with an unserializable payload field (a function): the message still displays,
// but capturing the whole error would fail to serialize.
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
