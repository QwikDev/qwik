import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import UserImport from '~/components/fixtures/user-import';

export default component$(() => <UserImport />);

export const head: DocumentHead = { title: 'user import' };
