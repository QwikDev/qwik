import { Slot, component$ } from '@builder.io/qwik';
import { Portal, PortalProvider } from './portal-provider';

export default component$(() => {
  // 1. Wrap a root component with a <PortalProvider> to enable portal API.
  //    The <PortalProvider> component will provide a context API to
  //    allow other components to create portals.
  // 2. Add <Portal/> to where you want the portals to be rendered.
  //    (<Portal/>s have names and so you can have multiple <Portal/> locations.)
  return (
    <PortalProvider>
      <Slot />
      <Portal name="modal" />
    </PortalProvider>
  );
});
