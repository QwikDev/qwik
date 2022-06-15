import { component$, Host, useScopedStyles$ } from '@builder.io/qwik';
import { useRoute, useMenu, usePage } from '@builder.io/qwik-city';
import styles from './sidebar.css?inline';

export const SideBar = component$(
  () => {
    useScopedStyles$(styles);

    const page = usePage();
    const route = useRoute();
    const menu = useMenu();
    if (!page) {
      return null;
    }

    return (
      <Host class="sidebar">
        <nav class="breadcrumbs">
          <ol>
            {page.breadcrumbs.map((b) => (
              <li>{b.text}</li>
            ))}
          </ol>
        </nav>
        <nav class="menu">
          {menu
            ? menu.items?.map((item) => (
                <>
                  <h5>{item.text}</h5>
                  <ul>
                    {item.items?.map((item) => (
                      <li>
                        <a
                          href={item.href}
                          class={{
                            'is-active': route.pathname === item.href,
                          }}
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ))
            : null}
        </nav>
      </Host>
    );
  },
  { tagName: 'aside' }
);
