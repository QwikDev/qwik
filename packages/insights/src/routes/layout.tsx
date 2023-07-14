import { Slot, component$ } from '@builder.io/qwik';
import { SymbolProvider } from '~/components/symbol';

export default component$(() => {
  return (
    <div>
      <SymbolProvider>
        <Slot />
      </SymbolProvider>
    </div>
  );
});
