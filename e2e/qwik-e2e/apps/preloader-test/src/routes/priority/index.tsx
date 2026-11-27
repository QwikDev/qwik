import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import PageLoad from '~/components/fixtures/priority/page-load';

export default component$(() => <PageLoad />);

export const head: DocumentHead = { title: 'priority of page-load requests' };
