import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import TasksOnASharedStore from '~/components/fixtures/tasks/shared-store';

export default component$(() => <TasksOnASharedStore />);

export const head: DocumentHead = { title: 'tasks on a shared store' };
