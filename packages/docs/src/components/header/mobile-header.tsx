import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import { Link } from '../action/action';
import { QwikLogoOnly } from '../svgs/qwik-logo';
import { modal, lucide } from '@qds.dev/ui';
import { SearchModal } from '../search/search';
import { ThemeToggle } from '../theme-toggle';
import { SidebarOpenButton } from './sidebar-open-button';

const MobileNavLink = (props: {
  href: string;
  label: string;
  active?: boolean;
}) => (
  <a
    href={props.href}
    class={[
      'pt-1 font-semibold text-base border-b-2 transition-colors w-fit',
      props.active
        ? 'text-standalone-emphasis border-emphasis'
        : 'text-foreground-base border-transparent hover:text-standalone-accent',
    ]}
  >
    {props.label}
  </a>
);

const MobileNavSection = (props: {
  title: string;
  pathname: string;
  links: { href: string; label: string }[];
}) => (
  <div class="flex min-w-0 flex-col gap-4">
    <span class="font-bold text-sm leading-[143%] text-foreground-muted">
      {props.title}
    </span>
    {props.links.map((link) => (
      <MobileNavLink
        key={link.href}
        {...link}
        active={isActive(props.pathname, link.href)}
      />
    ))}
  </div>
);

const isActive = (pathname: string | undefined, href: string) => {
  if (!pathname) {
    return false;
  }
  const clean = pathname.replace(/\/$/, '');
  const target = href.replace(/\/$/, '');
  return clean === target;
};

const showOnlyLogoMarkOnPhones = {
  class: 'max-sm:w-[26px]',
  preserveAspectRatio: 'xMinYMid slice',
};

export const MobileHeader = component$((props: { sidebarId?: string }) => {
  const { url } = useLocation();
  const pathname = url.pathname;
  return (
    <div class="2xl:hidden h-(--header-height) min-h-(--header-height)">
      <modal.root>
        {/* Top bar (always visible) */}
        <div class="fixed inset-x-0 top-4 z-99999 flex gap-4 lg:hidden mx-auto w-[calc(100%-2rem)] max-w-[900px]">
          {props.sidebarId && (
            <SidebarOpenButton sidebarId={props.sidebarId} class="xl:hidden" />
          )}
          <div class="min-w-0 flex-1 flex h-16 items-center justify-between rounded-2xl border-[1.6px] border-base bg-background-base px-5 shadow-base">
            <a
              href="/"
              class="flex items-center gap-2 text-foreground-accent"
              aria-label="Logo"
            >
              <QwikLogoOnly {...showOnlyLogoMarkOnPhones} />
            </a>
            <div class="flex items-center gap-4 min-[360px]:gap-8">
              <SearchModal />
              <ThemeToggle />
              <modal.trigger aria-label="Open menu">
                <lucide.menu class="vanilla-icon" />
              </modal.trigger>
            </div>
          </div>
        </div>

        {/* Full-width glass menu panel */}
        <modal.content
          class="fixed inset-0 z-99998 overflow-y-auto open:flex flex-col
            w-full h-full max-w-none m-0 p-0 border-none
            bg-background-base/50 backdrop-blur-xl
            shadow-[0px_2px_16px_0px_rgba(0,0,0,0.08)]"
        >
          {/* Header inside modal */}
          <div class="mt-4 shrink-0 mx-auto w-[calc(100%-2rem)] max-w-[900px] flex h-16 items-center justify-between rounded-2xl border-[1.6px] border-base bg-background-base px-5 shadow-base">
            <a
              href="/"
              class="flex items-center gap-2 text-foreground-accent"
              aria-label="Logo"
            >
              <QwikLogoOnly {...showOnlyLogoMarkOnPhones} />
            </a>
            <div class="flex items-center gap-4 min-[360px]:gap-8">
              <SearchModal />
              <ThemeToggle />
              <modal.close>
                <lucide.x class="vanilla-icon" />
              </modal.close>
            </div>
          </div>

          <div class="flex-1 px-5 py-8 mx-auto w-[calc(100%-2rem)] max-w-[900px]">
            <div class="flex flex-col gap-8">
              {/* Row 1: Core + Ecosystem */}
              <div class="grid grid-cols-2 gap-8">
                <MobileNavSection
                  title="Core"
                  pathname={pathname}
                  links={[
                    { href: '/docs', label: 'Qwik Core' },
                    { href: '/tutorial/welcome/overview', label: 'Tutorial' },
                    { href: '/docs/core/tasks', label: 'Lifecycle' },
                    { href: '/docs/core/events', label: 'Events' },
                    { href: '/docs/core/tasks', label: 'Tasks' },
                    { href: '/docs/core/slots', label: 'Slots' },
                  ]}
                />
                <MobileNavSection
                  title="Ecosystem"
                  pathname={pathname}
                  links={[
                    { href: '/docs/integrations', label: 'Integrations' },
                    { href: '/docs/cookbook', label: 'Cookbooks' },
                  ]}
                />
              </div>
              {/* Row 2: Router + Resources */}
              <div class="grid grid-cols-2 gap-8">
                <MobileNavSection
                  title="Router"
                  pathname={pathname}
                  links={[
                    { href: '/docs/qwikrouter', label: 'Qwik Router' },
                    { href: '/docs/routing', label: 'Routing' },
                    { href: '/docs/route-loader', label: 'Data Fetching' },
                    { href: '/docs/deployments', label: 'Deployments' },
                    { href: '/docs/middleware', label: 'Middleware' },
                    { href: '/docs/endpoints', label: 'API Routes' },
                  ]}
                />
                <MobileNavSection
                  title="Resources"
                  pathname={pathname}
                  links={[
                    { href: '/blog', label: 'Blog' },
                    { href: '/docs/concepts/think-qwik', label: 'Concepts' },
                    { href: '/playground', label: 'Playground' },
                    { href: '/docs/labs', label: 'Qwik Labs' },
                    { href: '/media/', label: 'Media' },
                    { href: '/press/', label: 'Press' },
                    { href: '/ecosystem/#community', label: 'Community' },
                  ]}
                />
              </div>
            </div>

            <div class="mt-8">
              <Link
                href="/docs/getting-started"
                variant="primary"
                class="text-sm"
              >
                <span>Get started</span>
                <lucide.arrowright class="size-4" />
              </Link>
            </div>
          </div>
        </modal.content>
      </modal.root>
    </div>
  );
});
