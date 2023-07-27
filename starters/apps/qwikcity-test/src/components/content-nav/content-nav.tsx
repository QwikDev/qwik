import {
  type ContentMenu,
  Link,
  useContent,
  useLocation,
} from "@builder.io/qwik-city";
import { component$, useStyles$ } from "@builder.io/qwik";
import styles from "./content-nav.css?inline";

export const ContentNav = component$(() => {
  useStyles$(styles);

  const { url } = useLocation();

  const { menu } = useContent();
  const items = flattenMenu(menu);

  const prev = getNav(items, url.pathname, -1);
  const next = getNav(items, url.pathname, 1);

  return (
    <nav class="content-nav">
      <div class="prev">
        {prev ? (
          <Link href={prev.href} prefetch={true}>
            {prev.text}
          </Link>
        ) : null}
      </div>
      <div class="next">
        {next ? (
          <Link href={next.href} prefetch>
            {next.text}
          </Link>
        ) : null}
      </div>
    </nav>
  );
});

export const getNav = (
  items: ContentMenu[],
  currentPathname: string,
  direction: -1 | 1,
) => {
  const currentIndex = items.findIndex((p) => p.href === currentPathname);
  if (currentIndex > -1) {
    let item = items[currentIndex + direction];
    if (item && item.href) {
      return item;
    }
    item = items[currentIndex + direction + direction];
    if (item && item.href) {
      return item;
    }
  }
};

export const flattenMenu = (menu: ContentMenu | undefined) => {
  const items: ContentMenu[] = [];
  const readMenu = (m: ContentMenu) => {
    items.push(m);
    if (m.items) {
      for (const item of m.items) {
        readMenu(item);
      }
    }
  };
  if (menu) {
    readMenu(menu);
  }
  return items;
};
