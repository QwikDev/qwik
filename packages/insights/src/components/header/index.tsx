import { component$ } from '@qwik.dev/core';
import { Link, useLocation } from '@qwik.dev/router';
import BrandLockup from '~/components/brand-lockup';
import { GithubIcon } from '~/components/icons/github';
import { useSession, useSignOut } from '~/routes/plugin@auth';

export default component$(() => {
  const signOutSig = useSignOut();
  const userCtx = useSession();
  const location = useLocation();
  const context = location.params.publicApiKey
    ? 'Application dashboard'
    : location.url.pathname.startsWith('/app/add')
      ? 'New application'
      : 'Application switcher';
  const userName = userCtx.value?.user?.name || userCtx.value?.user?.email;

  return (
    <header class="h-editorial-header border-b border-editorial-border bg-editorial-surface">
      <div class="mx-auto flex h-full max-w-editorial-viewport items-center px-editorial-6 editorial-desktop:pr-editorial-11 editorial-desktop:pl-editorial-18">
        <Link
          href="/app/"
          aria-label="Qwik Insights applications"
          class="rounded-editorial-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-editorial-accent"
        >
          <BrandLockup />
        </Link>

        <span class="ml-editorial-16 hidden text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase editorial-desktop:ml-editorial-26 md:inline">
          {context}
        </span>

        {userName && (
          <nav
            aria-label="Account"
            class="ml-auto flex items-center gap-editorial-6 text-editorial-14 font-semibold editorial-desktop:gap-editorial-14"
          >
            <span class="flex min-w-0 items-center gap-editorial-3">
              <GithubIcon class="h-6 w-6 shrink-0 text-editorial-primary" aria-hidden="true" />
              <span class="hidden max-w-48 truncate text-editorial-primary sm:inline">
                {userName}
              </span>
            </span>
            <button
              type="button"
              class="cursor-pointer rounded-editorial-sm text-editorial-link hover:text-editorial-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-editorial-accent"
              onClick$={() => {
                signOutSig.submit({ redirectTo: '/' });
              }}
            >
              Sign out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
});
