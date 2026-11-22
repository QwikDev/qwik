import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import TaskReadingAComputedFromContext from '~/components/fixtures/tasks/computed-from-context';

export default component$(() => <TaskReadingAComputedFromContext />);

export const head: DocumentHead = { title: 'task reading a computed from context' };
