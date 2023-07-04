import { MenuItems } from './menu-items';

export const MobileEcosystemMenu = () => {
  return (
    <nav class="moblie-ecosystem-menu px-6 lg:hidden">
      <details>
        <summary class="font-bold border border-transparent px-6 py-1 rounded-[5px] transi">
          Menu
        </summary>
        <ul class="flex flex-col gap-4 mt-2 p-4 border border-transparent">
          <MenuItems />
        </ul>
      </details>
    </nav>
  );
};
