import { component$ } from '@qwik.dev/core';
import { Link, useLocation } from '@qwik.dev/router';
import BrandLockup from '~/components/brand-lockup';
import { DashboardIcon } from '~/components/icons/dashboard';
import { EditIcon } from '~/components/icons/edit';
import { ErrorIcon } from '~/components/icons/error';
import { ManifestIcon } from '~/components/icons/manifest';
import { RoutesIcon } from '~/components/icons/routes';
import { SymbolIcon } from '~/components/icons/symbol';
import { isNavigationItemActive } from './active-path';

type ApplicationNavigationProps = {
  basePath: string;
};

export default component$<ApplicationNavigationProps>(({ basePath }) => {
  const pathname = useLocation().url.pathname;
  const primaryItems = [
    { href: basePath, label: 'Dashboard', icon: <DashboardIcon />, exact: true },
    { href: `${basePath}manifests/`, label: 'Manifests', icon: <ManifestIcon /> },
    { href: `${basePath}routes/`, label: 'Routes', icon: <RoutesIcon /> },
  ];
  const symbolItems = [
    { href: `${basePath}symbols/`, label: 'All symbols', exact: true },
    { href: `${basePath}symbols/edge/`, label: 'Edge' },
    { href: `${basePath}symbols/bundles/`, label: 'Bundles' },
    { href: `${basePath}symbols/slow/`, label: 'Slow symbols' },
  ];
  const symbolsPath = `${basePath}symbols/`;
  const errorsPath = `${basePath}errors/`;
  const settingsPath = `${basePath}edit/`;

  return (
    <aside class="sticky top-0 flex h-screen w-editorial-sidebar-expanded flex-col border-r border-editorial-border bg-editorial-surface">
      <Link
        href="/app/"
        aria-label="Qwik Insights applications"
        class="flex h-20 items-center px-editorial-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-editorial-accent"
      >
        <BrandLockup compact />
      </Link>

      <nav
        aria-label="Application"
        class="min-h-0 flex-1 overflow-y-auto px-editorial-3 pb-editorial-6"
      >
        <p class="px-editorial-2 text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
          Workspace
        </p>

        <div class="mt-editorial-3 grid gap-editorial-2">
          {primaryItems.map((item) => {
            const isActive = isNavigationItemActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                class={[
                  'relative flex h-editorial-11 items-center gap-editorial-3 rounded-editorial-md border-l-2 px-editorial-3 text-editorial-14 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-accent',
                  isActive
                    ? 'border-editorial-accent bg-editorial-selected font-semibold text-editorial-link'
                    : 'border-transparent font-medium text-editorial-primary hover:bg-editorial-subtle',
                ]}
              >
                <span class="application-navigation-icon flex h-6 w-6 shrink-0 items-center justify-center [&>svg]:h-6 [&>svg]:w-6">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div class="rounded-editorial-md bg-editorial-subtle py-editorial-2">
            <Link
              href={symbolsPath}
              class={[
                'flex h-editorial-11 items-center gap-editorial-3 rounded-editorial-md px-editorial-3 text-editorial-14 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-accent',
                isNavigationItemActive(pathname, symbolsPath)
                  ? 'text-editorial-link'
                  : 'text-editorial-primary hover:text-editorial-link',
              ]}
            >
              <span class="application-navigation-icon flex h-6 w-6 shrink-0 items-center justify-center [&>svg]:h-6 [&>svg]:w-6">
                <SymbolIcon />
              </span>
              <span>Symbols</span>
            </Link>

            <div class="ml-editorial-6 grid gap-editorial-1 border-l border-editorial-border py-editorial-1 pl-editorial-5">
              {symbolItems.map((item) => {
                const isActive = isNavigationItemActive(pathname, item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    class={[
                      'flex h-editorial-8 items-center rounded-editorial-sm text-editorial-12 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-accent',
                      isActive
                        ? 'font-semibold text-editorial-link'
                        : 'font-medium text-editorial-secondary hover:text-editorial-primary',
                    ]}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <Link
            href={errorsPath}
            aria-current={isNavigationItemActive(pathname, errorsPath) ? 'page' : undefined}
            class={[
              'relative flex h-editorial-11 items-center gap-editorial-3 rounded-editorial-md border-l-2 px-editorial-3 text-editorial-14 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-accent',
              isNavigationItemActive(pathname, errorsPath)
                ? 'border-editorial-accent bg-editorial-selected font-semibold text-editorial-link'
                : 'border-transparent font-medium text-editorial-primary hover:bg-editorial-subtle',
            ]}
          >
            <span class="application-navigation-icon flex h-6 w-6 shrink-0 items-center justify-center [&>svg]:h-6 [&>svg]:w-6">
              <ErrorIcon />
            </span>
            <span>Errors</span>
          </Link>
        </div>
      </nav>

      <div class="mx-editorial-4 border-t border-editorial-border py-editorial-5">
        <Link
          href={settingsPath}
          aria-current={isNavigationItemActive(pathname, settingsPath) ? 'page' : undefined}
          class={[
            'flex h-editorial-11 items-center gap-editorial-3 rounded-editorial-md px-editorial-2 text-editorial-14 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-accent',
            isNavigationItemActive(pathname, settingsPath)
              ? 'bg-editorial-selected font-semibold text-editorial-link'
              : 'font-medium text-editorial-primary hover:bg-editorial-subtle',
          ]}
        >
          <span class="application-navigation-icon flex h-6 w-6 shrink-0 items-center justify-center [&>svg]:h-6 [&>svg]:w-6">
            <EditIcon />
          </span>
          <span>Application settings</span>
        </Link>
      </div>
    </aside>
  );
});
