import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import Fixture from '~/components/fixtures/heavy-dep-qrl-prop';

export default component$(() => <Fixture />);

export const head: DocumentHead = { title: 'heavy dependency of a QRL prop' };
