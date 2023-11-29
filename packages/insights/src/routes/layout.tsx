import { Slot, component$ } from '@builder.io/qwik';

import { PopupManager } from '~/components/popup-manager';

export default component$(() => {
  return (
    <PopupManager>
      <Slot />
    </PopupManager>
  );
});
