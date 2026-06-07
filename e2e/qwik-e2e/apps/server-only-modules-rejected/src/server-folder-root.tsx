import { component$ } from '@qwik.dev/core';
import { getFolderClientValue } from './folder-client-helper';

export default component$(() => {
  return <main>{getFolderClientValue()}</main>;
});
