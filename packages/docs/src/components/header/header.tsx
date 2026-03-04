import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { QwikLogo } from '../svgs/qwik-logo';

export const Header = component$(() => {
  return (
    <header class="sticky top-0 z-50 w-full">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" aria-label="Qwik Homepage">
          <QwikLogo width={102.88} height={32} />
        </Link>

        <nav class="flex items-center gap-6">
          <ul>
            <li>Core</li>
            <li>Ecosystem</li>
            <li>Router</li>
            <li>Resources</li>
            {/* Search icon */}
          </ul>
        </nav>

        {/* Get Started button */}
      </div>
    </header>
  );
});
