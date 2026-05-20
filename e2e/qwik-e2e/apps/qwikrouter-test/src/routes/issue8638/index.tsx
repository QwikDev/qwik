import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { buildHead } from './head-helper';

export default component$(() => {
  return <h1 id="issue8638-marker">issue 8638</h1>;
});

export const head: DocumentHead = () => buildHead({});
