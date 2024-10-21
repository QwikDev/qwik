import { type RequestHandler } from '@qwik.dev/city';
import { component$ } from '@qwik.dev/core';

export const onRequest: RequestHandler = async ({ redirect }) => {
  if (!isLoggedIn()) {
    throw redirect(308, '/login');
  }
};

export default component$(() => {
  return <div>You are logged in.</div>;
});

function isLoggedIn() {
  return true; // Mock login as true
}
