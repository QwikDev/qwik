import { $, component$ } from '@qwik.dev/core';
import { routeLoaderQrl } from '@qwik.dev/router';
import { useDynamicSession } from '../../plugin@dynamic-session';

export const useQrlLoader = routeLoaderQrl($(() => 'qrl loader'));

export default component$(() => {
  const qrlLoader = useQrlLoader();
  const session = useDynamicSession();

  return (
    <>
      <div id="prod-qrl-loader">{qrlLoader.value}</div>
      <div id="prod-session-user">{session.value ?? 'No user'}</div>
    </>
  );
});
