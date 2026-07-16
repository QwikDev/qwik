// Expect error: { "messageId": "noAwaitBlocking" }

import { component$, useTask$ } from '@builder.io/qwik';
import { useNavigate } from '@builder.io/qwik-city';

export default component$(() => {
  const nav = useNavigate();
  useTask$(async () => {
    await nav('/');
  });
  return <div />;
});
