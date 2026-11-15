import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import ImportChain from '~/components/fixtures/harness/import-chain';

export default component$(() => <ImportChain />);

export const head: DocumentHead = { title: 'harness: import chain' };
