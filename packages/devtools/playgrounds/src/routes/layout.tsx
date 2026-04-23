import type { RequestHandler } from '@qwik.dev/router';
import { component$, Slot } from '@qwik.dev/core';
import { Link, useLocation } from '@qwik.dev/router';
import { PlaygroundGlyph } from '~/components/playground/icons';
import { siteNavigation } from '~/content/playground-content';

export const onGet: RequestHandler = async ({ cacheControl }) => {
  // Control caching for this request for best performance and to reduce hosting costs:
  // https://qwik.dev/docs/caching/
  cacheControl({
    // Always serve a cached response by default, up to a week stale
    staleWhileRevalidate: 60 * 60 * 24 * 7,
    // Max once every 5 seconds, revalidate on the server to get a fresh version of this page
    maxAge: 5,
  });
};

export default component$(() => {
  const location = useLocation();

  const isActive = (href: string) =>
    href === '/' ? location.url.pathname === '/' : location.url.pathname.startsWith(href);

  return (
    <div class="app-shell">
      <div class="app-shell__orb app-shell__orb--one" />
      <div class="app-shell__orb app-shell__orb--two" />

      <div class="app-frame">
        <header class="topbar glass-frame">
          <Link class="brand-mark" href="/">
            <span class="brand-mark__icon">
              <PlaygroundGlyph class="brand-mark__glyph" name="stack" />
            </span>
            <span>
              <strong>Qwik Playgrounds</strong>
              <small>Command surface for demos and inspection</small>
            </span>
          </Link>

          <nav class="topnav" aria-label="Primary">
            {siteNavigation.map((item) => (
              <Link
                key={item.href}
                class={{
                  'topnav-link': true,
                  'topnav-link--active': isActive(item.href),
                }}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div class="status-pill">
            <span class="status-pill__dot" />
            Devtools-ready surface
          </div>
        </header>

        <main class="page-frame">
          <Slot />
        </main>

        <footer class="site-footer glass-frame">
          <div>
            <div class="site-footer__title">Built for richer route, state, and resource demos.</div>
            <div class="site-footer__copy">
              The shell is intentionally atmospheric, but every panel still maps to a real Qwik
              behavior worth inspecting.
            </div>
          </div>
          <div class="site-footer__meta">
            <span>Qwik Router</span>
            <span>Signals</span>
            <span>Resources</span>
            <span>Nested notes</span>
          </div>
        </footer>
      </div>
    </div>
  );
});
