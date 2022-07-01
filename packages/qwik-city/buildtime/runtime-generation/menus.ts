import type { ContentMenu } from '../../runtime/src/library/types';
import type { BuildContext, ParsedMenuItem } from '../types';

export function createMenus(ctx: BuildContext, c: string[]) {
  const totalMenus = ctx.menus.length;

  if (totalMenus > 0) {
    c.push(`\n/** Qwik City Menus (${totalMenus}) */`);
    c.push(`const menus = {`);
    for (const parsedMenu of ctx.menus) {
      const menu = createRuntimeMenu(parsedMenu);
      c.push(`  ${JSON.stringify(parsedMenu.pathname)}: ${JSON.stringify(menu)},`);
    }
    c.push(`};`);
  }

  return totalMenus;
}

function createRuntimeMenu(parsedMenu: ParsedMenuItem) {
  const runtimeMenu: ContentMenu = {
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
