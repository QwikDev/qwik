import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import Modal from '~/components/fixtures/modal';

export default component$(() => <Modal />);

export const head: DocumentHead = { title: 'modal' };
