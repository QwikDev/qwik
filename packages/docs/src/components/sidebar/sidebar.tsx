import { $, component$, sync$, useContext, useOnDocument, useStyles$ } from '@qwik.dev/core';
import { Link, routeLoader$, useContent, useLocation, type ContentMenu } from '@qwik.dev/router';
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

export const SideBar = component$((props: { allOpen?: boolean }) => {
  useStyles$(styles);

  const globalStore = useContext(GlobalStore);
  const { menu } = useContent();
  const { url } = useLocation();
  const markdownItems = useMarkdownItems();
  const allOpen = url.pathname.startsWith('/qwikrouter/') || props.allOpen;

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

  const closeSideMenuOpen = $(() => {
    globalStore.sideMenuOpen = false;
  });

  return (
    <aside class="sidebar">
      <nav id="qwik-sidebar" class="menu">
        <button class="menu-close lg:hidden" onClick$={closeSideMenuOpen} type="button">
          <CloseIcon width={24} height={24} />
        </button>
        <Items
          items={menu?.items}
          pathname={url.pathname}
          allOpen={allOpen}
          markdownItems={markdownItems.value}
          onLinkClick$={closeSideMenuOpen}
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
  onLinkClick$,
}: {
  items?: ContentMenu[];
  pathname: string;
  allOpen?: boolean;
  markdownItems: MarkdownItems;
  onLinkClick$: () => void;
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
                  onLinkClick$={onLinkClick$}
                />
              </details>
            ) : (
              <Link
                href={item.href}
                class={[
                  'flex relative',
                  {
                    'is-active': pathname === item.href,
                  },
                ]}
                onClick$={onLinkClick$}
              >
                {item.text}
              </Link>
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
