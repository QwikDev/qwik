import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import Spinner from '~/components/fixtures/computeds/spinner';

export default component$(() => <Spinner />);

export const head: DocumentHead = { title: 'a click that shows a spinner' };
