import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import VisibleAbove from '~/components/fixtures/visible/above';

export default component$(() => <VisibleAbove />);

export const head: DocumentHead = { title: 'visible task above the fold' };
