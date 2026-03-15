import { component$, useSignal } from '@qwik.dev/core';
import { Link, routeLoader$, useContent, useLocation, type ContentMenu } from '@qwik.dev/router';
import { lucide, tree } from '@qds.dev/ui';

export const useMarkdownItems = routeLoader$(async () => {
  const rawData = await Promise.all(
    Object.entries(import.meta.glob<{ frontmatter?: MDX }>('../../routes/**/*.{md,mdx}')).map(
      async ([k, v]) => {
        return [
          k
            .replace('../../routes', '')
            .replace('(qwikrouter)/', '')
            .replace('(qwik)/', '')
            .replaceAll(/([()])/g, '')
            .replace('index.mdx', '')
            .replace('index.md', ''),
          await v(),
        ] as const;
      }
    )
  );
  const markdownItems: MarkdownItems = {};
  rawData.map(([k, v]) => {
    if (v.frontmatter?.updated_at) {
      markdownItems[k] = {
        title: v.frontmatter.title,
        contributors: v.frontmatter.contributors,
        created_at: v.frontmatter.created_at,
        updated_at: v.frontmatter.updated_at,
      };
    }
  });
  return markdownItems;
});

type MarkdownItems = Record<string, MDX>;
type MDX = {
  title: string;
  contributors: string[];
  created_at: string;
  updated_at: string;
};

export const SideBar = component$(() => {
  const { menu } = useContent();
  const { url } = useLocation();

  const introSection = menu?.items?.[0];
  const guidesSections = menu?.items?.slice(1);

  return (
    <aside class="hidden 2xl:sticky 2xl:top-(--header-height) 2xl:block 2xl:max-h-[calc(100vh-var(--header-height))]">
      <nav class="flex flex-col h-full overflow-y-auto w-[287px] bg-background-base border-r-[1.6px] border-base px-4 py-6 gap-4">
        {/* Logo + collapse */}
        <div class="flex items-center justify-between">
          <Link href="/" aria-label="Qwik Home">
            <QwikLogomark />
          </Link>
          <button type="button" class="flex items-center justify-center rounded-lg p-2">
            <lucide.panelleftclose class="size-6 text-foreground-base" />
          </button>
        </div>

        {/* Sidebar Content */}
        <tree.root class="flex flex-col gap-6">
          {introSection && (
            <div>
              <div class="font-bold leading-[22px] text-[16px] p-2 text-foreground-base">
                {introSection.text}
              </div>
              <div class="flex flex-col gap-0.5">
                {introSection.items?.map((item, i) => (
                  <IntroTreeItem key={i} item={item} pathname={url.pathname} />
                ))}
              </div>
            </div>
          )}

          {guidesSections && guidesSections.length > 0 && (
            <div>
              <div class="font-bold leading-[22px] text-[16px] p-2 text-foreground-base">
                Guides
              </div>
              <div class="flex flex-col gap-0.5">
                {guidesSections.map((section, i) => (
                  <GuidesTreeNode
                    key={i}
                    section={section}
                    pathname={url.pathname}
                    sectionIndex={i}
                  />
                ))}
              </div>
            </div>
          )}
        </tree.root>
      </nav>
    </aside>
  );
});

const IntroTreeItem = component$((props: { item: ContentMenu; pathname: string }) => {
  const isActive = props.pathname === props.item.href;

  return (
    <tree.item>
      <tree.itemlabel class="w-full">
        <Link
          href={props.item.href}
          tabIndex={-1}
          class={[
            'flex items-center gap-2 p-2 rounded-lg text-[16px] leading-[22px] font-semibold',
            isActive
              ? 'bg-background-accent text-standalone-emphasis border-[1.6px] border-transparent'
              : 'text-foreground-muted hover:border-background-accent border-[1.6px] border-transparent',
          ]}
        >
          <IntroItemIcon text={props.item.text} />
          <span>{props.item.text}</span>
        </Link>
      </tree.itemlabel>
    </tree.item>
  );
});

const GuidesTreeNode = component$(
  (props: { section: ContentMenu; pathname: string; sectionIndex: number }) => {
    const { section, pathname, sectionIndex } = props;

    if (!section.items || section.items.length === 0) {
      return null;
    }

    const hasActiveChild = section.items.some((item) => pathname === item.href);
    const isOpen = useSignal(sectionIndex === 0 || hasActiveChild);

    return (
      <tree.item bind:open={isOpen}>
        <tree.itemtrigger class="group w-full cursor-pointer flex items-center p-2 rounded-lg hover:text-standalone-accent text-foreground-muted justify-between">
          <span class="flex items-center gap-2 text-[16px] leading-[22px] font-semibold">
            <GuideSectionIcon name={section.text} />
            <span>{section.text.replace(' 🧪', '')}</span>
          </span>
          <lucide.chevronright
            ui-open={isOpen.value}
            class="ui-open:rotate-90 transition-transform duration-200 size-4 shrink-0"
          />
        </tree.itemtrigger>
        <tree.itemcontent>
          {section.items?.map((item, j) => {
            const isActive = pathname === item.href;
            return (
              <tree.item key={j}>
                <tree.itemlabel class="w-full">
                  <Link
                    href={item.href}
                    tabIndex={-1}
                    class={[
                      'flex items-center gap-2 pl-6 pr-2 py-2 rounded-lg text-[16px] leading-[22px] font-semibold',
                      isActive
                        ? 'bg-background-accent text-standalone-emphasis border-[1.6px] border-transparent'
                        : 'text-foreground-muted hover:border-background-accent border-[1.6px] border-transparent',
                    ]}
                  >
                    <span class="truncate">{item.text}</span>
                  </Link>
                </tree.itemlabel>
              </tree.item>
            );
          })}
        </tree.itemcontent>
      </tree.item>
    );
  }
);

const GuideSectionIcon = component$<{ name: string }>((props) => {
  const cls = 'size-5 flex-shrink-0';
  switch (props.name) {
    case 'Components':
      return <lucide.layers class={cls} />;
    case 'Qwik Router':
      return <lucide.route class={cls} />;
    case 'Cookbook':
      return <lucide.chefhat class={cls} />;
    case 'Integrations':
      return <lucide.puzzle class={cls} />;
    case 'Deployments':
      return <lucide.rocket class={cls} />;
    case 'Guides':
      return <lucide.compass class={cls} />;
    case 'Concepts':
      return <lucide.lightbulb class={cls} />;
    case 'Advanced':
      return <lucide.settings class={cls} />;
    case 'Reference':
      return <lucide.filetext class={cls} />;
    case 'Experimental 🧪':
      return <lucide.testtubediagonal class={cls} />;
    case 'Community':
      return <lucide.users class={cls} />;
    default:
      return null;
  }
});

const IntroItemIcon = component$<{ text: string }>((props) => {
  const cls = 'size-5 flex-shrink-0';
  switch (props.text) {
    case 'Overview':
      return <lucide.filetext class={cls} />;
    case 'Getting Started':
      return <lucide.play class={cls} />;
    case 'Project structure':
      return <lucide.foldertree class={cls} />;
    case 'FAQ':
      return <lucide.circlequestionmark class={cls} />;
    default:
      return null;
  }
});

const QwikLogomark = component$(() => {
  return (
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
  );
});
