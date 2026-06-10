import { component$ } from '@qwik.dev/core';
import { getClientValue } from './client-helper';

export default component$(() => {
  return <main>{getClientValue()}</main>;
});
