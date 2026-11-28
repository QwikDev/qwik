import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { NavPage } from '~/components/fixtures/navigation/nav-page';

export default component$(() => <NavPage fixture="computeds/second-navigation-b" />);

export const head: DocumentHead = { title: 'a second navigation, page b' };
