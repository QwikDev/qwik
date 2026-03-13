import { component$, type JSXOutput } from '@qwik.dev/core';
import { Button } from '../action/action';
import { QwikLogoOnly } from '../svgs/qwik-logo';
import { modal, navbar, lucide, streamlinepixel as pixel } from '@qds.dev/ui';
import navBlogImg from '../../media/navbar/nav-blog.png';
import navConceptsImg from '../../media/navbar/nav-concepts.png';
import navCookbooksImg from '../../media/navbar/nav-cookbooks.png';
import navIntegrationsImg from '../../media/navbar/nav-integrations.png';
import navQwikCoreImg from '../../media/navbar/nav-qwik-core.png';
import navRouterImg from '../../media/navbar/nav-router.png';
import navTutorialImg from '../../media/navbar/nav-tutorial.png';
import { tw } from '~/utils/utils';

const ImageCard = (props: {
  href: string;
  label: string;
  description: string;
  image: string;
  class?: string;
}) => (
  <a
    href={props.href}
    class={[
      'relative rounded-lg overflow-hidden flex flex-col gap-1 items-start justify-end p-4 group',
      props.class,
    ]}
  >
    <img
      src={props.image}
      alt=""
      class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 will-change-transform"
    />
    <div class="absolute bottom-0 left-0 right-0 h-[134px] bg-linear-to-b from-transparent to-standalone-accent" />
    <div class="absolute inset-0 pointer-events-none rounded-[inherit] shadow-secondary-border-inset" />
    <span class="relative font-bold text-base leading-[22px] text-primary-foreground-base">
      {props.label}
    </span>
    <span class="relative font-semibold text-sm leading-[20px] text-primary-foreground-accent">
      {props.description}
    </span>
  </a>
);

const NavPill = (props: { href: string; label: string; icon?: JSXOutput }) => (
  <a
    href={props.href}
    class="flex gap-3 items-center px-4 pt-4 pb-3 relative rounded-[4px] bg-secondary-background-base hover:bg-secondary-background-accent transition-colors shadow-secondary-border-inset"
  >
    <div class="size-9 bg-secondary-background-base border-[1.6px] border-emphasis rounded-lg shadow-xs-emphasis flex items-center justify-center shrink-0">
      {props.icon}
    </div>
    <span class="font-bold text-base leading-[22px] text-secondary-foreground-base whitespace-nowrap">
      {props.label}
    </span>
  </a>
);

const contentBaseClass = tw(
  'open:flex fixed top-[calc(76px+24px+16px)] left-1/2 -translate-x-1/2 m-0 gap-4 shadow-emphasis rounded-2xl p-4 border-[1.6px] border-emphasis bg-background-base transition-[opacity,display,overlay] transition-discrete duration-325 ease-in-out open:animate-to-visible not-open:animate-from-visible opacity-0'
);

const triggerAnchorReset = 'anchor-name: none;';
const contentAnchorReset = 'position-anchor: none;';
const navPillIconClass = 'size-5 text-border-emphasis';

const contentWidths: Record<string, string> = {
  Core: 'w-[calc(100vw-48px)] max-w-[840px]',
  Ecosystem: 'w-[calc(100vw-48px)] max-w-[680px]',
  Router: 'w-[calc(100vw-48px)] max-w-[680px]',
  Resources: 'w-[calc(100vw-48px)] max-w-[680px]',
};

const getContentWidthClass = (label: string) => contentWidths[label] ?? contentWidths.Core;

const MobileNavLink = (props: { href: string; label: string; active?: boolean }) => (
  <a
    href={props.href}
    class={[
      'pt-1 font-semibold text-base leading-[22px] border-b-2 transition-colors',
      props.active
        ? 'text-standalone-accent border-standalone-emphasis'
        : 'text-foreground-base border-transparent hover:text-standalone-accent',
    ]}
  >
    {props.label}
  </a>
);

const MobileNavSection = (props: {
  title: string;
  links: { href: string; label: string; active?: boolean }[];
}) => (
  <div class="flex flex-col gap-4 w-[130px]">
    <span class="font-bold text-sm leading-[20px] text-foreground-soft">{props.title}</span>
    {props.links.map((link) => (
      <MobileNavLink key={link.href} {...link} />
    ))}
  </div>
);

const MobileHeader = component$(() => {
  return (
    <div class="2xl:hidden">
      <modal.root>
        {/* Top bar (always visible) */}
        <div class="fixed top-0 left-0 right-0 z-99999 flex items-center justify-between px-4 py-4 bg-background-base border-b-[1.6px] border-base">
          <a href="/" class="flex items-center gap-2 text-foreground-accent">
            <QwikLogoOnly />
          </a>
          <modal.trigger class="text-foreground-base">
            <lucide.menu class="size-6" />
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
              <button class="text-foreground-base">
                <lucide.search class="size-6" />
              </button>
              <modal.close class="text-foreground-base">
                <lucide.x class="size-6" />
              </modal.close>
            </div>
          </div>

          <div class="px-6 py-10 flex-1">
            <div class="flex flex-col gap-8">
              {/* Row 1: Core + Ecosystem */}
              <div class="flex gap-16">
                <MobileNavSection
                  title="Core"
                  links={[
                    { href: '/docs', label: 'Qwik Core', active: true },
                    { href: '/tutorial', label: 'Tutorial' },
                    { href: '/docs/lifecycle', label: 'Lifecycle' },
                    { href: '/docs/events', label: 'Events' },
                    { href: '/docs/tasks', label: 'Tasks' },
                    { href: '/docs/slots', label: 'Slots' },
                  ]}
                />
                <MobileNavSection
                  title="Ecosystem"
                  links={[
                    { href: '/integrations', label: 'Integrations' },
                    { href: '/cookbooks', label: 'Cookbooks' },
                  ]}
                />
              </div>
              {/* Row 2: Router + Resources */}
              <div class="flex gap-16">
                <MobileNavSection
                  title="Router"
                  links={[
                    { href: '/router', label: 'Qwik Router' },
                    { href: '/docs/routing', label: 'Routing' },
                    { href: '/docs/data-fetching', label: 'Data Fetching' },
                    { href: '/docs/deployments', label: 'Deployments' },
                    { href: '/docs/middleware', label: 'Middleware' },
                    { href: '/docs/api-routes', label: 'API Routes' },
                  ]}
                />
                <MobileNavSection
                  title="Resources"
                  links={[
                    { href: '/blog', label: 'Blog' },
                    { href: '/concepts', label: 'Concepts' },
                    { href: '/sandbox', label: 'Sandbox' },
                    { href: '/labs', label: 'Qwik Labs' },
                  ]}
                />
              </div>
            </div>

            <div class="mt-8">
              <Button variant="primary" class="text-sm">
                <span>Get started</span>
                <lucide.arrowright class="size-4" />
              </Button>
            </div>
          </div>
        </modal.content>
      </modal.root>
    </div>
  );
});

export const Header = component$(() => {
  return (
    <>
      <MobileHeader />
      <div class="has-[[ui-open]]:before:opacity-100 before:pointer-events-none before:fixed before:inset-0 before:z-99998 before:bg-background-base/40 before:opacity-0 before:backdrop-blur-sm before:transition-opacity before:duration-300 before:ease before:content-[''] 2xl:block hidden">
        <navbar.root class="fixed top-6 left-1/2 z-99999 flex w-full max-w-[840px] -translate-x-1/2 items-center justify-between rounded-2xl border-[1.6px] border-base bg-background-base px-6 shadow-base">
          <a href="/" class="flex items-center gap-2 text-foreground-accent">
            <QwikLogoOnly />
          </a>

          <div class="flex items-center">
            {/* ── Core ── */}
            <navbar.item class="relative">
              <navbar.itemtrigger
                class="w-fit flex items-center gap-2 group ui-open:text-standalone-accent transition-colors duration-200 h-[76px] px-5 cursor-pointer"
                style={triggerAnchorReset}
              >
                <span>Core</span>
              </navbar.itemtrigger>
              <navbar.itemcontent
                class={[contentBaseClass, getContentWidthClass('Core')]}
                style={contentAnchorReset}
              >
                {/* Pills column */}
                <div class="flex flex-col gap-4 w-64.5 shrink-0">
                  <NavPill
                    href="/docs/state"
                    label="State"
                    icon={<pixel.internetnetworkarrowsync class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/docs/lifecycle"
                    label="Lifecycle"
                    icon={<pixel.changecleanenergy class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/docs/events"
                    label="Events"
                    icon={<pixel.interfaceessentialcursorclickpoint class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/docs/tasks"
                    label="Tasks"
                    icon={<pixel.interfaceessentiallist class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/docs/slots"
                    label="Slots"
                    icon={<pixel.contentfilesarchivebooks1 class={navPillIconClass} />}
                  />
                </div>
                {/* Image cards */}
                <ImageCard
                  href="/docs"
                  label="Qwik Core"
                  description="What's inside the core framework?"
                  image={navQwikCoreImg}
                  class="w-64.5 shrink-0 self-stretch"
                />
                <ImageCard
                  href="/tutorial"
                  label="Your first app"
                  description="A guided tutorial"
                  image={navTutorialImg}
                  class="w-64.5 shrink-0 self-stretch"
                />
              </navbar.itemcontent>
            </navbar.item>

            {/* ── Ecosystem ── */}
            <navbar.item class="relative">
              <navbar.itemtrigger
                class="w-fit flex items-center gap-2 group ui-open:text-standalone-accent transition-colors duration-200 h-[76px] px-5 cursor-pointer"
                style={triggerAnchorReset}
              >
                <span>Ecosystem</span>
              </navbar.itemtrigger>
              <navbar.itemcontent
                class={[contentBaseClass, getContentWidthClass('Ecosystem')]}
                style={contentAnchorReset}
              >
                <ImageCard
                  href="/integrations"
                  label="Integrations"
                  description="Find tools you can use out-of-the-box with Qwik"
                  image={navIntegrationsImg}
                  class="h-[364px] flex-1 min-w-0"
                />
                <ImageCard
                  href="/cookbooks"
                  label="Cookbooks"
                  description="Guides, recipes and examples"
                  image={navCookbooksImg}
                  class="h-[364px] flex-1 min-w-0"
                />
              </navbar.itemcontent>
            </navbar.item>

            {/* ── Router ── */}
            <navbar.item class="relative">
              <navbar.itemtrigger
                class="w-fit flex items-center gap-2 group ui-open:text-standalone-accent transition-colors duration-200 h-[76px] px-5 cursor-pointer"
                style={triggerAnchorReset}
              >
                <span>Router</span>
              </navbar.itemtrigger>
              <navbar.itemcontent
                class={[contentBaseClass, getContentWidthClass('Router')]}
                style={contentAnchorReset}
              >
                {/* Pills column */}
                <div class="flex flex-col gap-4 w-64.5 shrink-0">
                  <NavPill
                    href="/docs/routing"
                    label="Routing"
                    icon={<pixel.computersdeviceselectronicsboard class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/docs/data-fetching"
                    label="Data Fetching"
                    icon={<pixel.internetnetworkdownload class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/docs/deployments"
                    label="Deployments"
                    icon={<pixel.businessproductstartup1 class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/docs/middleware"
                    label="Middleware"
                    icon={<pixel.interfaceessentialhierarchy1 class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/docs/api-routes"
                    label="API Routes"
                    icon={<pixel.interfaceessentialcogdouble class={navPillIconClass} />}
                  />
                </div>
                {/* Single wide image card */}
                <ImageCard
                  href="/router"
                  label="Qwik Router"
                  description="A fast way to start iterating with Qwik apps"
                  image={navRouterImg}
                  class="flex-1 min-w-0 self-stretch"
                />
              </navbar.itemcontent>
            </navbar.item>

            {/* ── Resources ── */}
            <navbar.item class="relative">
              <navbar.itemtrigger
                class="w-fit flex items-center gap-2 group ui-open:text-standalone-accent transition-colors duration-200 h-[76px] px-5 cursor-pointer"
                style={triggerAnchorReset}
              >
                <span>Resources</span>
              </navbar.itemtrigger>
              <navbar.itemcontent
                class={[contentBaseClass, getContentWidthClass('Resources')]}
                style={contentAnchorReset}
              >
                {/* Wide image card */}
                <ImageCard
                  href="/blog"
                  label="Blog"
                  description="Latest news and updates"
                  image={navBlogImg}
                  class="flex-1 min-w-0 self-stretch"
                />
                {/* Right column: half-height card + pills */}
                <div class="flex flex-col gap-4 w-64.5 shrink-0">
                  <ImageCard
                    href="/concepts"
                    label="Concepts"
                    description="Think Qwik"
                    image={navConceptsImg}
                    class="h-[212px]"
                  />
                  <NavPill
                    href="/sandbox"
                    label="Sandbox"
                    icon={<pixel.codingappswebsitesplugin class={navPillIconClass} />}
                  />
                  <NavPill
                    href="/labs"
                    label="Qwik Labs"
                    icon={<pixel.healthlaboratory class={navPillIconClass} />}
                  />
                </div>
              </navbar.itemcontent>
            </navbar.item>
          </div>

          <navbar.item>
            <Button variant="primary">
              <span>Get Started</span>
              <lucide.arrowright class="size-4" />
            </Button>
          </navbar.item>
        </navbar.root>
      </div>
    </>
  );
});
