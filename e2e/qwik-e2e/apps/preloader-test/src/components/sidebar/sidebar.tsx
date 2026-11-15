import { component$ } from '@qwik.dev/core';
import { routes } from './routes';

const groups = [...new Set(routes.map((route) => route.group))];

export const Sidebar = component$(() => {
  return (
    <nav class="sidebar">
      <a href="/">Preloader test</a>
      {groups.map((group) => (
        <section key={group}>
          <h3>{group}</h3>
          <ul>
            {routes
              .filter((route) => route.group === group)
              .map((route) => (
                <li key={route.href}>
                  <a href={route.href}>{route.label}</a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </nav>
  );
});
