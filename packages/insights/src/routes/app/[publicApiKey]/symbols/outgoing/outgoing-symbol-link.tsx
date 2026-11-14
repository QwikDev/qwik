import { component$ } from '@qwik.dev/core';
import { SymbolIcon } from '~/components/icons/symbol';

export const OutgoingSymbolLink = component$<{ publicApiKey: string; symbol: string }>(
  ({ publicApiKey, symbol }) => (
    <a
      href={`/app/${encodeURIComponent(publicApiKey)}/symbols/outgoing/?symbol=${encodeURIComponent(symbol)}`}
    >
      <SymbolIcon />
      <span class="ml-1">{symbol}</span>
    </a>
  )
);
