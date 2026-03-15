import { Link, useContent, useLocation } from "@qwik.dev/router";
import { component$, Fragment, useStyles$ } from "@qwik.dev/core";
import styles from "./menu.css?inline";

export const Menu = component$(() => {
  useStyles$(styles);

  const { menu } = useContent();
  const { url } = useLocation();

  return (
    <aside class="menu">
      {menu
        ? menu.items?.map((item, i) => (
            <Fragment key={item.href}>
              <h5 data-test-menu-header={i}>{item.text}</h5>
              <ul>
                {item.items?.map((item) => (
                  <li key={item.href}>
                    <Link
                      data-test-menu-link={item.href}
                      href={item.href}
                      class={{
                        "is-active": url.pathname === item.href,
                      }}
                    >
                      {item.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </Fragment>
          ))
        : null}
    </aside>
  );
});
