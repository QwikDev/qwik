import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';

export const NavigationLoader = component$(() => {
  const location = useLocation();

  return (
    <div
      role="status"
      style={{ display: location.isNavigating ? 'flex' : 'none' }}
      class="fixed inset-0 z-50 items-center justify-center bg-slate-950/20 backdrop-blur-[1px]"
    >
      <div class="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-lg">
        <span class="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
        Loading...
      </div>
    </div>
  );
});
