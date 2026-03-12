import { component$, type JSXOutput } from '@qwik.dev/core';
import { Button } from '../button/button';
import { QwikLogoOnly } from '../svgs/qwik-logo';
import { navbar, lucide } from '@qds.dev/ui';
import navBlogImg from '../../media/navbar/nav-blog.png';
import navConceptsImg from '../../media/navbar/nav-concepts.png';
import navCookbooksImg from '../../media/navbar/nav-cookbooks.png';
import navIntegrationsImg from '../../media/navbar/nav-integrations.png';
import navQwikCoreImg from '../../media/navbar/nav-qwik-core.png';
import navRouterImg from '../../media/navbar/nav-router.png';
import navTutorialImg from '../../media/navbar/nav-tutorial.png';

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
    <div class="absolute bottom-0 left-0 right-0 h-[134px] bg-gradient-to-b from-transparent to-standalone-accent" />
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
    <div class="size-9 bg-secondary-background-base border-[1.6px] border-emphasis rounded-lg shadow-icon flex items-center justify-center shrink-0">
      {props.icon}
    </div>
    <span class="font-bold text-base leading-[22px] text-secondary-foreground-base whitespace-nowrap">
      {props.label}
    </span>
  </a>
);

const contentBaseClass =
  'w-full open:flex gap-4 shadow-card rounded-2xl p-4 border-[1.6px] border-emphasis bg-background-base transition-[opacity,display,overlay] transition-discrete duration-325 ease-in-out open:animate-to-visible not-open:animate-from-visible opacity-0';

export const Header = component$(() => {
  return (
    <div class="flex justify-center">
      <navbar.root class="flex items-center justify-between px-6 justify-self-center bg-background-base fixed top-6 w-full rounded-2xl border-[1.6px] border-base shadow-base z-99999 max-w-[840px]">
        <a href="/" class="flex items-center gap-2 text-foreground-accent">
          <QwikLogoOnly />
        </a>

        <div class="flex items-center gap-10">
          {/* ── Core ── */}
          <navbar.item class="relative">
            <navbar.itemtrigger class="w-fit flex items-center gap-2 group ui-open:text-border-emphasis transition-colors duration-200 h-[76px]">
              <span>Core</span>
            </navbar.itemtrigger>
            <navbar.itemcontent class={contentBaseClass}>
              {/* Pills column */}
              <div class="flex flex-col gap-4 w-64.5 shrink-0">
                <NavPill href="/docs/state" label="State" />
                <NavPill href="/docs/lifecycle" label="Lifecycle" />
                <NavPill href="/docs/events" label="Events" />
                <NavPill href="/docs/tasks" label="Tasks" />
                <NavPill href="/docs/slots" label="Slots" />
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
            <navbar.itemtrigger class="w-fit flex items-center gap-2 group ui-open:text-border-emphasis transition-colors duration-200 h-[76px]">
              <span>Ecosystem</span>
            </navbar.itemtrigger>
            <navbar.itemcontent class={contentBaseClass}>
              <ImageCard
                href="/integrations"
                label="Integrations"
                description="Find tools you can use out-of-the-box with Qwik"
                image={navIntegrationsImg}
                class="flex-1 min-w-0 self-stretch"
              />
              <ImageCard
                href="/cookbooks"
                label="Cookbooks"
                description="Guides, recipes and examples"
                image={navCookbooksImg}
                class="flex-1 min-w-0 self-stretch"
              />
            </navbar.itemcontent>
          </navbar.item>

          {/* ── Router ── */}
          <navbar.item class="relative">
            <navbar.itemtrigger class="w-fit flex items-center gap-2 group ui-open:text-border-emphasis transition-colors duration-200 h-[76px]">
              <span>Router</span>
            </navbar.itemtrigger>
            <navbar.itemcontent class={contentBaseClass}>
              {/* Pills column */}
              <div class="flex flex-col gap-4 w-64.5 shrink-0">
                <NavPill href="/docs/routing" label="Routing" />
                <NavPill href="/docs/data-fetching" label="Data Fetching" />
                <NavPill href="/docs/deployments" label="Deployments" />
                <NavPill href="/docs/middleware" label="Middleware" />
                <NavPill href="/docs/api-routes" label="API Routes" />
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
            <navbar.itemtrigger class="w-fit flex items-center gap-2 group ui-open:text-border-emphasis transition-colors duration-200 h-[76px]">
              <span>Resources</span>
            </navbar.itemtrigger>
            <navbar.itemcontent class={contentBaseClass}>
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
                <NavPill href="/sandbox" label="Sandbox" />
                <NavPill href="/labs" label="Qwik Labs" />
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
  );
});
