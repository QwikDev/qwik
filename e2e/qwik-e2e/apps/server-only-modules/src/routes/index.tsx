import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { loadSecret } from '../db.server';
import { loadFolderSecret } from '../server/folder-secret';

export const useSecret = routeLoader$(() => {
  return `${loadSecret()} ${loadFolderSecret()}`;
});

export default component$(() => {
  const secret = useSecret();
  return <main>{secret.value}</main>;
});
