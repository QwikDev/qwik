import { type DocumentHead, type RouteConfig, useHttpStatus } from '@qwik.dev/router';
import { component$ } from '@qwik.dev/core';

export default component$(() => {
  const httpStatus = useHttpStatus();

  return (
    <div>
      <h1>Custom Error Page</h1>
      <p class="error-status">{httpStatus.status}</p>
      <p class="error-message">{httpStatus.message}</p>
    </div>
  );
});

export const routeConfig: RouteConfig = ({ status }) => {
  return {
    head: { title: `Error ${status}` },
  };
};
