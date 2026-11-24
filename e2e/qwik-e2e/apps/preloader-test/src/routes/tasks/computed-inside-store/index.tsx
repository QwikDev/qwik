import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import TaskReadingAComputedInsideAStore from '~/components/fixtures/tasks/computed-inside-store';

export default component$(() => <TaskReadingAComputedInsideAStore />);

export const head: DocumentHead = { title: 'task reading a computed inside a store' };
