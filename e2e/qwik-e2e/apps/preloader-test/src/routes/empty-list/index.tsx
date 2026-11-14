import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import EmptyList from '~/components/fixtures/empty-list';

export default component$(() => <EmptyList />);

export const head: DocumentHead = { title: 'list the server rendered empty' };
