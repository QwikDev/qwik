import { component$ } from '@builder.io/qwik';
import { NavLink } from '..';

export default component$(() => {
  return (
    <>
      Links
      <div>
        <NavLink href="/docs" activeClass="text-green-600">
          /docs
        </NavLink>
      </div>
      <div>
        <NavLink
          href="/demo/cookbook/nav-link/example/"
          activeClass="text-green-600"
        >
          /demo/cookbook/nav-link/example/
        </NavLink>
      </div>
    </>
  );
});
