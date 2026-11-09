import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import Fixture from '~/components/fixtures/scoped-styles';

export default component$(() => <Fixture />);

export const head: DocumentHead = { title: 'scoped styles' };
