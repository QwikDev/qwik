import { component$, type Signal } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import { Link } from '../action/action';
import { QwikLogoOnly } from '../svgs/qwik-logo';
import { modal, lucide } from '@qds.dev/ui';

const MobileNavLink = (props: { href: string; label: string; active?: boolean }) => (
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
    <span class="font-bold text-sm leading-[143%] text-foreground-muted">{props.title}</span>
    {props.links.map((link) => (
      <MobileNavLink key={link.href} {...link} active={isActive(props.pathname, link.href)} />
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

export const MobileHeader = component$((props: { mobileSidebarOpen?: Signal<boolean> }) => {
  const { url } = useLocation();
  const pathname = url.pathname;
  return (
    <div class="2xl:hidden h-16 min-h-16">
      <modal.root>
        {/* Top bar (always visible) */}
        <div class="fixed top-0 left-0 right-0 z-99999 flex items-center justify-between px-4 py-4 bg-background-base border-b-[1.6px] border-base h-16">
          <div class="flex items-center gap-2">
            {props.mobileSidebarOpen && (
              <button
                type="button"
                aria-label={props.mobileSidebarOpen.value ? 'Close sidebar' : 'Open sidebar'}
                aria-expanded={props.mobileSidebarOpen.value}
                class="flex items-center justify-center p-0"
                onClick$={() => (props.mobileSidebarOpen!.value = !props.mobileSidebarOpen!.value)}
              >
                {props.mobileSidebarOpen.value ? (
                  <lucide.panelleftclose class="vanilla-icon" />
                ) : (
                  <lucide.panelleftopen class="vanilla-icon" />
                )}
              </button>
            )}
            <a href="/" class="flex items-center gap-2 text-foreground-accent">
              <QwikLogoOnly />
            </a>
          </div>
          <modal.trigger>
            <lucide.menu class="vanilla-icon" />
          </modal.trigger>
        </div>

        {/* Full-width glass menu panel */}
        <modal.content
          class="fixed inset-0 z-99998 overflow-y-auto open:flex flex-col
            w-full h-full max-w-none m-0 p-0 border-none
            bg-white/50 backdrop-blur-xl
            shadow-[0px_2px_16px_0px_rgba(0,0,0,0.08)]"
        >
          {/* Header inside modal */}
          <div class="flex items-center justify-between px-4 py-4 border-b-[1.6px] border-base shrink-0 bg-background-base">
            <a href="/" class="flex items-center gap-2 text-foreground-accent">
              <QwikLogoOnly />
            </a>
            <div class="flex items-center gap-8">
              <button>
                <lucide.search class="vanilla-icon" />
              </button>
              <modal.close>
                <lucide.x class="vanilla-icon" />
              </modal.close>
            </div>
          </div>

          <div class="px-6 py-8 flex-1">
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
                  ]}
                />
              </div>
            </div>

            <div class="mt-8">
              <Link href="/docs/getting-started" variant="primary" class="text-sm">
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
