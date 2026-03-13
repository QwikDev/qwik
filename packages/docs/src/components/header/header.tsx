import { component$ } from '@qwik.dev/core';
import { MobileHeader } from './mobile-header';
import { DesktopHeader } from './desktop-header';

export const Header = component$(() => {
  return (
    <>
      <MobileHeader />
      <DesktopHeader />
    </>
  );
});
