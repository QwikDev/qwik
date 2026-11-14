import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import TasksInSiblings from '~/components/fixtures/tasks/siblings';

export default component$(() => <TasksInSiblings />);

export const head: DocumentHead = { title: 'tasks in two siblings' };
