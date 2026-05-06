import { component$, type Signal } from '@qwik.dev/core';
import { MobileHeader } from './mobile-header';
import { DesktopHeader } from './desktop-header';

export const Header = component$((props: { mobileSidebarOpen?: Signal<boolean> }) => {
  return (
    <>
      <MobileHeader mobileSidebarOpen={props.mobileSidebarOpen} />
      <DesktopHeader />
    </>
  );
});
