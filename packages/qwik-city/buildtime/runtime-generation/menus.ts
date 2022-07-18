import type { BuildContext } from '../types';

export function createMenus(ctx: BuildContext, c: string[]) {
  if (ctx.menus.length > 0) {
    c.push(`\n/** Qwik City Menus (${ctx.menus.length}) */`);
    c.push(`const menus = {`);
    for (const m of ctx.menus) {
      c.push(`  ${JSON.stringify(m.pathname)}: () => import(${JSON.stringify(m.filePath)}),`);
    }
    c.push(`};`);
  }

  return ctx.menus.length;
}

// function createRuntimeMenu(parsedMenu: ParsedMenuItem) {
//   const runtimeMenu: ContentMenu = {
//     text: parsedMenu.text,
//   };

//   if (typeof parsedMenu.href === 'string') {
//     runtimeMenu.href = parsedMenu.href;
//   }
//   if (Array.isArray(parsedMenu.items)) {
//     runtimeMenu.items = parsedMenu.items.map(createRuntimeMenu);
//   }

//   return runtimeMenu;
// }
