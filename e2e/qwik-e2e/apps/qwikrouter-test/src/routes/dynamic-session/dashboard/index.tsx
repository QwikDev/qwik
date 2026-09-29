import { component$ } from '@qwik.dev/core';
import { useDynamicSession } from '../../plugin@dynamic-session';

export default component$(() => {
  const session = useDynamicSession();

  return <div id="dynamic-session-user">{session.value ?? 'No user'}</div>;
});
