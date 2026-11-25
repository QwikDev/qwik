import { component$, Slot } from '@qwik.dev/core';
import SecondNavigation from '~/components/fixtures/computeds/second-navigation';

export default component$(() => (
  <>
    <SecondNavigation />
    <Slot />
  </>
));
