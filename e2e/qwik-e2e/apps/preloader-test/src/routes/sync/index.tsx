import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import Fixture from '~/components/fixtures/sync';

export default component$(() => <Fixture />);

export const head: DocumentHead = { title: 'sync' };
