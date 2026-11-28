import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import ClickAfterLoad from '~/components/fixtures/computeds/click-after-load';

export default component$(() => <ClickAfterLoad />);

export const head: DocumentHead = { title: 'a click right after load' };
