import { component$ } from '@qwik.dev/core';
import { getReExportedClientValue } from './re-export-client-helper';

export default component$(() => {
  return <main>{getReExportedClientValue()}</main>;
});
