import { MenuItems } from './menu-items';

export const MobileEcosystemMenu = () => {
  return (
    <nav class="moblie-ecosystem-menu px-6 lg:hidden">
      <details>
        <summary class="transi rounded-[5px] border border-transparent px-6 py-1 font-bold">
          Menu
        </summary>
        <ul class="mt-2 flex flex-col gap-4 border border-transparent p-4">
          <MenuItems />
        </ul>
      </details>
    </nav>
  );
};
