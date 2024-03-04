import { component$ } from '@builder.io/qwik';
import { type RequestHandler } from '@builder.io/qwik-city';

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
