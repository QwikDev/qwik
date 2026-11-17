import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { NavPage } from '~/components/fixtures/navigation/nav-page';

export default component$(() => <NavPage fixture="navigation/shell-home" />);

export const head: DocumentHead = { title: 'shell home' };
