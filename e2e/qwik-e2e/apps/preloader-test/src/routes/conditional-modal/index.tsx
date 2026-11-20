import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import ConditionalModal from '~/components/fixtures/conditional-modal';

export default component$(() => <ConditionalModal />);

export const head: DocumentHead = { title: 'conditional modal' };
