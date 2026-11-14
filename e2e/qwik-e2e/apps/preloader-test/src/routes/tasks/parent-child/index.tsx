import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import TasksInParentAndChild from '~/components/fixtures/tasks/parent-child';

export default component$(() => <TasksInParentAndChild />);

export const head: DocumentHead = { title: 'tasks in a parent and its child' };
