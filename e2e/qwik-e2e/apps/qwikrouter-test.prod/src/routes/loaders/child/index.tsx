import { $, component$ } from '@qwik.dev/core';
import { routeLoaderQrl } from '@qwik.dev/router';

export const useQrlLoader = routeLoaderQrl($(() => 'qrl loader'));

export default component$(() => {
  const qrlLoader = useQrlLoader();

  return <div id="prod-qrl-loader">{qrlLoader.value}</div>;
});
