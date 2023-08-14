import { Slot, component$ } from '@builder.io/qwik';
import { PopupManager } from './popup-manager';

export default component$(() => {
  // wrap a root component with a <PopupManager> to enable popups
  // The <PopupManager> component will provide a context API to
  // allow other components to show/hide popups.
  return (
    <PopupManager>
      <Slot />
    </PopupManager>
  );
});
