import { component$, useStyles$ } from '@builder.io/qwik';
import { useContent, Link, useLocation } from '@builder.io/qwik-city';
import styles from './menu.css?inline';

export const Menu = component$(() => {
  useStyles$(styles);

  const { menu } = useContent();
  const { pathname } = useLocation();

  return (
    <aside class="menu">
      {menu
        ? menu.items?.map((item, i) => (
            <>
              <h5 data-test-menu-header={i}>{item.text}</h5>
              <ul>
                {item.items?.map((item) => (
                  <li>
                    <Link
                      data-test-menu-link={item.href}
                      href={item.href}
                      prefetch={true}
                      class={{
                        'is-active': pathname === item.href,
                      }}
                    >
                      {item.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ))
        : null}
    </aside>
  );
});
