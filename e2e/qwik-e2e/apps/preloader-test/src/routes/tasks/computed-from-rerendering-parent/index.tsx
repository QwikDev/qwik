import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import TaskReadingAComputedFromARerenderingParent from '~/components/fixtures/tasks/computed-from-rerendering-parent';

export default component$(() => <TaskReadingAComputedFromARerenderingParent />);

export const head: DocumentHead = {
  title: 'task reading a computed from props while its parent re-renders',
};
