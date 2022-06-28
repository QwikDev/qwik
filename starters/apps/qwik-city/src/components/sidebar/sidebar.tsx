import { component$, Host, useScopedStyles$ } from '@builder.io/qwik';
import { useLocation, useContentMenu, useContentBreadcrumbs } from '@builder.io/qwik-city';
import styles from './sidebar.css?inline';

export const SideBar = component$(
  () => {
    useScopedStyles$(styles);

    const loc = useLocation();
    const menu = useContentMenu();
    const breadcrumbs = useContentBreadcrumbs();

    return (
      <Host class="sidebar">
        <nav class="breadcrumbs">
          <ol itemScope itemType="https://schema.org/BreadcrumbList">
            {breadcrumbs?.map((b) => (
              <li>
                {b.text}
                <meta itemProp="position" content="0"></meta>
              </li>
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
                            'is-active': loc.pathname === item.href,
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
