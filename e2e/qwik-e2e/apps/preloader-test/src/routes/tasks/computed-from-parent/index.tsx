import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import TaskReadingAComputedFromItsParent from '~/components/fixtures/tasks/computed-from-parent';

export default component$(() => <TaskReadingAComputedFromItsParent />);

export const head: DocumentHead = { title: 'task reading a computed from another component' };
