import { component$, useContext, useStyles$ } from '@builder.io/qwik';
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

  return (
    <aside class="sidebar">
      <nav class="menu">
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
}: {
  items?: ContentMenu[];
  pathname: string;
  allOpen?: boolean;
  markdownItems: MarkdownItems;
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
                <Items items={item.items} pathname={pathname} markdownItems={markdownItems} />
              </details>
            ) : (
              <a
                href={item.href}
                class={{
                  'is-active': pathname === item.href,
                }}
                style={{ display: 'flex' }}
              >
                <>
                  {item.text}
                  {renderUpdated(item.href!, markdownItems)}
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
