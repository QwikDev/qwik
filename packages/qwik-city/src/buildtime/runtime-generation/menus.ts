import type { Menu } from '../../runtime/types';
import type { BuildContext, ParsedMenuItem } from '../types';

export function createMenus(ctx: BuildContext, c: string[]) {
  c.push(`\n/** Qwik City Menus (${ctx.menus.length}) */`);
  c.push(`export const menus = {`);
  for (const parsedMenu of ctx.menus) {
    const menu = createRuntimeMenu(parsedMenu);
    c.push(`  ${JSON.stringify(parsedMenu.pathname)}: ${JSON.stringify(menu)},`);
  }
  c.push(`};`);
}

function createRuntimeMenu(parsedMenu: ParsedMenuItem) {
  const runtimeMenu: Menu = {
    text: parsedMenu.text,
  };

  if (typeof parsedMenu.href === 'string') {
    runtimeMenu.href = parsedMenu.href;
  }
  if (Array.isArray(parsedMenu.items)) {
    runtimeMenu.items = parsedMenu.items.map(createRuntimeMenu);
  }

  return runtimeMenu;
}
