import { component$ } from '@builder.io/qwik';
import { NavLink } from '..';

export default component$(() => {
  return (
    <>
      Links
      <div>
        <NavLink href="/docs" activeClass="active" pendingClass="pending">
          Docs
        </NavLink>
      </div>
      <div>
        <NavLink
          href="/docs/cookbook/nav-link/"
          activeClass="active"
          pendingClass="pending"
        >
          NavLink
        </NavLink>
      </div>
    </>
  );
});
