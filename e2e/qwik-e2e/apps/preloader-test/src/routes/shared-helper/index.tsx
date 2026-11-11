import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import SharedHelper from '~/components/fixtures/shared-helper';

export default component$(() => <SharedHelper />);

export const head: DocumentHead = { title: 'shared helper' };
