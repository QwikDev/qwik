/**
 * This route does NOT use server$. Its module should NOT be eagerly imported. The E2E test verifies
 * the global is NOT set until this route is visited.
 */
import { component$ } from '@qwik.dev/core';

// This side effect should only run when the route is visited (lazy import)
(globalThis as any).__noServerFnModuleLoaded = true;

export default component$(() => {
  return (
    <div>
      <h1>No Server$ Test</h1>
      <p>This module has no server$ functions and should be lazily loaded.</p>
    </div>
  );
});
