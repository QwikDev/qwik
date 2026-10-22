import { component$, Slot } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useGroupUser = routeLoader$(() => ({ name: 'Ada' }), { id: 'group-layout' });

export default component$(() => {
  const user = useGroupUser();
  return (
    <>
      <p id="group-user">group user: {user.value.name}</p>
      <Slot />
    </>
  );
});
