import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { NavButton } from '~/components/fixtures/navigation/nav-button';

export default component$(() => <NavButton />);

export const head: DocumentHead = { title: 'navigation from (nav())' };
