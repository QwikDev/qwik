import { component$, isBrowser } from '@qwik.dev/core';
import { inspectorLink } from './constant';
import { setupIframeThemeSync } from './iframe-theme';

/**
 * Inspect iframe must load under app root (Vite `BASE_URL` + origin), not `location.pathname`, so
 * deep routes do not produce `.../nested/route__inspect/`. SSR: no `location` — return empty until
 * the client runs.
 */
function getInspectIframeSrc(): string {
  if (!isBrowser) {
    return '';
  }
  const base = new URL(import.meta.env.BASE_URL ?? '/', location.origin);
  return new URL(inspectorLink, base).href;
}

export const Inspect = component$(() => {
  return (
    <div class="border-glass-border bg-card-item-bg h-full w-full flex-1 overflow-hidden rounded-2xl border">
      <iframe
        src={getInspectIframeSrc()}
        width={'100%'}
        height={'100%'}
        id="inspect_qwik"
        class="h-full w-full rounded-xl"
        onLoad$={(_, el) => {
          try {
            setupIframeThemeSync(el);
          } catch (err) {
            console.error('Failed to inject theme into inspect iframe:', err);
          }
        }}
      ></iframe>
    </div>
  );
});
