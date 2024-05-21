import { component$, sync$, useContext, useOnDocument, useStyles$ } from '@builder.io/qwik';
import { type ContentMenu, useContent, useLocation, routeLoader$ } from '@builder.io/qwik-city';
import { GlobalStore } from '../../context';
import { CloseIcon } from '../svgs/close-icon';
import styles from './sidebar.css?inline';

export const useMarkdownItems = routeLoader$(async () => {
  const rawData = await Promise.all(
    Object.entries(import.meta.glob<{ frontmatter?: MDX }>('../../routes/**/*.{md,mdx}')).map(
      async ([k, v]) => {
        return [
          k
            .replace('../../routes', '')
            .replace('(qwikcity)/', '')
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

const DAYS = 24 * 60 * 60 * 1000;

const renderUpdated = (itemHref: string, markdownItems: MarkdownItems) => {
  const updatedAt = markdownItems[itemHref]?.updated_at;

  if (updatedAt) {
    const isUpdated = new Date(updatedAt).getTime() + 14 * DAYS > new Date().getTime();

    return isUpdated ? <div class="updated"></div> : null;
  }

  return null;
};

export const SideBar = component$((props: { allOpen?: boolean }) => {
  useStyles$(styles);

  const globalStore = useContext(GlobalStore);
  const { menu } = useContent();
  const { url } = useLocation();
  const markdownItems = useMarkdownItems();
  const allOpen = url.pathname.startsWith('/qwikcity/') || props.allOpen;

  useOnDocument(
    'DOMContentLoaded',
    sync$(() => {
      try {
        const val = sessionStorage.getItem('qwik-sidebar');
        const savedScroll = !val || /null|NaN/.test(val) ? 0 : +val;
        const el = document.getElementById('qwik-sidebar');
        if (el) {
          el.scrollTop = savedScroll;
          el.style.visibility = 'visible';
        }
      } catch (err) {
        //
      }
    })
  );

  return (
    <aside class="sidebar">
      <nav id="qwik-sidebar" class="menu">
        <button
          class="menu-close lg:hidden"
          onClick$={() => (globalStore.sideMenuOpen = !globalStore.sideMenuOpen)}
          type="button"
        >
          <CloseIcon width={24} height={24} />
        </button>
        <Items
          items={menu?.items}
          pathname={url.pathname}
          allOpen={allOpen}
          markdownItems={markdownItems.value}
          onClick$={sync$(() => {
            try {
              const scrollTop = document.getElementById('qwik-sidebar')!.scrollTop;
              sessionStorage.setItem('qwik-sidebar', String(scrollTop));
            } catch (err) {
              //
            }
          })}
        />
      </nav>
    </aside>
  );
});

export function Items({
  items,
  pathname,
  allOpen,
  markdownItems,
  onClick$,
}: {
  items?: ContentMenu[];
  pathname: string;
  allOpen?: boolean;
  markdownItems: MarkdownItems;
  onClick$?: any;
}) {
  return (
    <ul>
      {items &&
        items.map((item, i) => (
          <li key={i}>
            {item.items ? (
              <details
                open={allOpen || i < 1 || item.items?.some((item) => pathname === item.href)}
              >
                <summary>
                  <h5>{item.text}</h5>
                </summary>
                <Items
                  items={item.items}
                  pathname={pathname}
                  markdownItems={markdownItems}
                  onClick$={onClick$}
                />
              </details>
            ) : (
              <a
                href={item.href}
                class={{
                  'is-active': pathname === item.href,
                }}
                // Prefetch server request on hover
                onMouseOver$={sync$(
                  (_evt: Event, target: HTMLAnchorElement & { __prefetchLink: number }): void => {
                    // Constants
                    const fiveMinutesInMilliseconds = 5 * 60 * 1000;
                    const dateNow = Date.now();

                    // Check if hover is possible in the current environment
                    const canHover = window.matchMedia('(hover: hover)').matches;
                    if (!canHover) {
                      // console.log('Skipping prefetch because hover is not supported');
                      return;
                    }

                    // Check valid target
                    if (!target?.href) {
                      // console.error('Invalid target or target.href');
                      return;
                    }

                    // Calculate timeGap
                    const timeGap = dateNow - (target.__prefetchLink || 0);

                    if (timeGap < fiveMinutesInMilliseconds) {
                      // console.log(
                      //   'NO Prefetching... Wait for 5 minutes since the last one',
                      //   target.href
                      // );
                      return;
                    }

                    // console.log('Prefetching...', target.href);
                    // Prefetch & Update '__prefetchLink'
                    const prefetchLink = document.createElement('link');
                    prefetchLink.href = target.href;
                    prefetchLink.rel = 'prefetch';
                    document.head.appendChild(prefetchLink);

                    target.__prefetchLink = dateNow; // Update prefetch timestamp
                  }
                )}
                onClick$={onClick$}
                style={{ display: 'flex', position: 'relative' }}
              >
                <>
                  {renderUpdated(item.href!, markdownItems)}
                  {item.text}
                </>
              </a>
            )}
          </li>
        ))}
    </ul>
  );
}

export function createBreadcrumbs(menu: ContentMenu | undefined, pathname: string) {
  if (menu?.items) {
    for (const breadcrumbA of menu.items) {
      if (breadcrumbA.href === pathname) {
        return [breadcrumbA];
      }

      if (breadcrumbA.items) {
        for (const breadcrumbB of breadcrumbA.items) {
          if (breadcrumbB.href === pathname) {
            return [breadcrumbA, breadcrumbB];
          }

          if (breadcrumbB.items) {
            for (const breadcrumbC of breadcrumbB.items) {
              if (breadcrumbC.href === pathname) {
                return [breadcrumbA, breadcrumbB, breadcrumbC];
              }
            }
          }
        }
      }
    }
  }

  return [];
}
