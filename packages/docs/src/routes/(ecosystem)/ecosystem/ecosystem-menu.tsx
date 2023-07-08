import { MenuItems } from './menu-items';

export const EcosystemMenu = () => {
  return (
    <aside class="hidden lg:block lg:pl-6">
      <div class="ecosystem-menu">
        <h3>Explore</h3>
        <ul>
          <MenuItems />
        </ul>
      </div>
    </aside>
  );
};
