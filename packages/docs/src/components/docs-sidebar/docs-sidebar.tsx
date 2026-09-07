import { component$, type Signal } from '@qwik.dev/core';
import { Link, useContent, useLocation, type ContentMenu } from '@qwik.dev/router';
import { lucide } from '@qds.dev/ui';

export const DocsSidebar = component$((props: { mobileOpen: Signal<boolean> }) => {
  const { menu } = useContent();
  const { url } = useLocation();
  const introSection = menu?.items?.[0];
  const guideSections = menu?.items?.slice(1) ?? [];

  return (
    <aside
      data-docs-sidebar
      class={[
        'fixed inset-y-0 left-0 z-50 xl:sticky xl:top-0 xl:h-screen xl:pointer-events-auto',
        props.mobileOpen.value ? 'pointer-events-auto' : 'pointer-events-none',
      ]}
    >
      <nav
        aria-label="Documentation"
        onClick$={(event) => {
          if ((event.target as Element).closest('a[href]')) {
            props.mobileOpen.value = false;
          }
        }}
        class={[
          'flex h-full w-[287px] flex-col gap-4 overflow-y-auto border-r-[1.6px] border-base bg-background-base px-4 py-6 [scrollbar-gutter:stable] transition-transform duration-300 ease',
          props.mobileOpen.value ? 'translate-x-0' : '-translate-x-full xl:translate-x-0',
        ]}
      >
        <div class="flex items-center">
          <Link href="/" aria-label="Qwik Home" prefetchBundles="intent" prefetchData="intent">
            <QwikLogomark />
          </Link>
        </div>

        <div class="flex flex-col gap-6">
          {introSection && (
            <section>
              <h2 class="p-2 text-[16px] font-bold leading-[22px] text-foreground-base">
                {introSection.text}
              </h2>
              <div class="flex flex-col gap-0.5">
                {introSection.items?.map((item) => (
                  <MenuLink
                    key={item.href}
                    item={item}
                    pathname={url.pathname}
                    paddingClass="px-2"
                    introIcon
                  />
                ))}
              </div>
            </section>
          )}

          {guideSections.length > 0 && (
            <section>
              <h2 class="p-2 text-[16px] font-bold leading-[22px] text-foreground-base">Guides</h2>
              <div class="flex flex-col gap-0.5">
                {guideSections.map((section, index) => (
                  <MenuSection
                    key={section.text}
                    section={section}
                    pathname={url.pathname}
                    initiallyOpen={index === 0}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </nav>
    </aside>
  );
});

const MenuSection = component$(
  (props: { section: ContentMenu; pathname: string; initiallyOpen: boolean }) => {
    if (!props.section.items?.length) {
      return null;
    }

    return (
      <details
        open={props.initiallyOpen || containsActiveLink(props.section, props.pathname)}
        class="group"
      >
        <summary class="flex cursor-pointer list-none items-center justify-between rounded-lg p-2 text-[16px] font-semibold leading-[22px] text-foreground-muted hover:text-standalone-accent [&::-webkit-details-marker]:hidden">
          <span class="flex items-center gap-2">
            <GuideSectionIcon name={props.section.text} />
            <span>{props.section.text.replace(' 🧪', '')}</span>
          </span>
          <lucide.chevronright class="size-4 shrink-0 transition-transform duration-200 group-open:rotate-90" />
        </summary>
        <div class="flex flex-col gap-0.5">
          {props.section.items.map((item) =>
            item.items?.length ? (
              <MenuSubsection key={item.text} section={item} pathname={props.pathname} />
            ) : (
              <MenuLink
                key={item.href}
                item={item}
                pathname={props.pathname}
                paddingClass="pl-13 pr-2"
              />
            )
          )}
        </div>
      </details>
    );
  }
);

const MenuSubsection = component$((props: { section: ContentMenu; pathname: string }) => {
  if (!props.section.items?.length) {
    return null;
  }

  return (
    <details open={containsActiveLink(props.section, props.pathname)} class="group/subsection">
      <summary class="flex cursor-pointer list-none items-center justify-between rounded-lg py-2 pl-6 pr-2 text-[16px] font-semibold leading-[22px] text-foreground-muted hover:text-standalone-accent [&::-webkit-details-marker]:hidden">
        <span class="flex items-center gap-2">
          <SubsectionIcon name={props.section.text} />
          <span>{props.section.text}</span>
        </span>
        <lucide.chevronright class="size-4 shrink-0 transition-transform duration-200 group-open/subsection:rotate-90" />
      </summary>
      <div class="flex flex-col gap-0.5">
        {props.section.items.map((item) => (
          <MenuLink
            key={item.href}
            item={item}
            pathname={props.pathname}
            paddingClass="pl-10 pr-2"
          />
        ))}
      </div>
    </details>
  );
});

const MenuLink = component$(
  (props: { item: ContentMenu; pathname: string; paddingClass: string; introIcon?: boolean }) => {
    if (!props.item.href) {
      return null;
    }

    const isActive = isSamePath(props.pathname, props.item.href);

    return (
      <Link
        href={props.item.href}
        prefetchBundles="intent"
        prefetchData="intent"
        aria-current={isActive ? 'page' : undefined}
        class={[
          'flex items-center gap-2 rounded-lg border-[1.6px] border-transparent py-2 text-[16px] font-semibold leading-[22px]',
          props.paddingClass,
          isActive
            ? 'bg-background-emphasis text-standalone-emphasis'
            : 'text-foreground-muted hover:bg-background-accent hover:text-standalone-accent',
        ]}
      >
        {props.introIcon && <IntroIcon text={props.item.text} />}
        <span class="truncate">{props.item.text}</span>
      </Link>
    );
  }
);

const containsActiveLink = (item: ContentMenu, pathname: string): boolean =>
  (!!item.href && isSamePath(pathname, item.href)) ||
  item.items?.some((child) => containsActiveLink(child, pathname)) === true;

const isSamePath = (pathname: string, href: string) =>
  normalizePath(pathname) === normalizePath(href);

const normalizePath = (pathname: string) =>
  pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

const IntroIcon = component$((props: { text: string }) => {
  switch (props.text) {
    case 'Overview':
      return <lucide.filetext class="vanilla-icon" />;
    case 'Getting Started':
      return <lucide.play class="vanilla-icon" />;
    case 'Project structure':
      return <lucide.foldertree class="vanilla-icon" />;
    case 'FAQ':
      return <lucide.circlequestionmark class="vanilla-icon" />;
    case 'Upgrade':
      return <lucide.sparkles class="vanilla-icon" />;
    default:
      return null;
  }
});

const GuideSectionIcon = component$((props: { name: string }) => {
  switch (props.name) {
    case 'Foundation':
      return <lucide.box class="vanilla-icon" />;
    case 'Router':
      return <lucide.route class="vanilla-icon" />;
    case 'Cookbook':
      return <lucide.chefhat class="vanilla-icon" />;
    case 'Integrations':
      return <lucide.puzzle class="vanilla-icon" />;
    case 'Deployments':
      return <lucide.rocket class="vanilla-icon" />;
    case 'Guides':
      return <lucide.compass class="vanilla-icon" />;
    case 'Reference':
      return <lucide.filetext class="vanilla-icon" />;
    case 'Experimental 🧪':
      return <lucide.testtubediagonal class="vanilla-icon" />;
    default:
      return null;
  }
});

const SubsectionIcon = component$((props: { name: string }) => {
  switch (props.name) {
    case 'Concepts':
      return <lucide.lightbulb class="vanilla-icon" />;
    case 'Advanced':
      return <lucide.settings class="vanilla-icon" />;
    default:
      return null;
  }
});

const QwikLogomark = component$(() => (
  <svg width="25" height="27" viewBox="0 0 47 53" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M40.973 52.5351L32.0861 43.6985L31.9503 43.7179V43.621L13.0511 24.9595L17.708 20.4637L14.9721 4.76715L1.99103 20.8513C-0.220992 23.0798 -0.628467 26.7036 0.962635 29.3778L9.07337 42.8265C10.3152 44.9 12.566 46.1402 14.9915 46.1208L19.0081 46.082L40.973 52.5351Z"
      fill="#18B6F6"
    />
    <path
      d="M45.8232 20.5411L44.038 17.2468L43.1066 15.5609L42.738 14.902L42.6992 14.9408L37.8094 6.47238C36.587 4.34075 34.2974 3.02301 31.8137 3.04239L27.5255 3.15865L14.7384 3.19741C12.313 3.21679 10.101 4.49577 8.87853 6.56927L1.09766 21.9945L15.0101 4.72831L33.2496 24.7656L30.0091 28.0406L31.9495 43.7178L31.9689 43.679V43.7178H31.9301L31.9689 43.7565L33.4824 45.2293L40.8364 52.4187C41.1469 52.7094 41.6514 52.3606 41.4379 51.9924L36.8975 43.0589L44.8142 28.4282L45.0664 28.1375C45.1634 28.0212 45.2604 27.905 45.3381 27.7887C46.8904 25.6764 47.1038 22.8472 45.8232 20.5411Z"
      fill="#AC7EF4"
    />
    <path
      d="M33.3076 24.6882L15.0099 4.74774L17.61 20.3668L12.9531 24.882L31.9105 43.6985L30.203 28.0794L33.3076 24.6882Z"
      fill="white"
    />
  </svg>
));
