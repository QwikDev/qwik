/**
 * This route tests that server$ functions are eagerly registered on the server. The global variable
 * is set as a side effect when this module is imported. The E2E test verifies this by checking the
 * global via an API endpoint WITHOUT first visiting this route.
 */
import { component$ } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';

// This side effect runs when the module is imported.
// With the virtual:qwik-router-server-fns mechanism, this should run at server startup.
(globalThis as any).__serverFnEagerlyRegistered = true;

const getRegistrationStatus = server$(function () {
  return (globalThis as any).__serverFnEagerlyRegistered === true;
});

export default component$(() => {
  return (
    <div>
      <h1>Server$ Eager Registration Test</h1>
      <p>This page tests that server$ modules are eagerly imported on the server.</p>
      <button
        id="check-registration"
        onClick$={async () => {
          const result = await getRegistrationStatus();
          document.getElementById('result')!.textContent = String(result);
        }}
      >
        Check
      </button>
      <p id="result"></p>
    </div>
  );
});
