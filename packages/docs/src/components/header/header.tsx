import { component$ } from '@qwik.dev/core';
import { MobileHeader } from './mobile-header';
import { DesktopHeader } from './desktop-header';

export const Header = component$((props: { sidebarId?: string }) => {
  return (
    <>
      <MobileHeader sidebarId={props.sidebarId} />
      <DesktopHeader sidebarId={props.sidebarId} />
    </>
  );
});
