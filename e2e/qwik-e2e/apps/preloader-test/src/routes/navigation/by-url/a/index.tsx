import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { NavPage } from '~/components/fixtures/navigation/nav-page';

export default component$(() => <NavPage fixture="navigation/by-url-a" />);

export const head: DocumentHead = { title: 'by url, page a' };
