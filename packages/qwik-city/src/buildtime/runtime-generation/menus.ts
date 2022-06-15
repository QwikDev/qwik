import type { BuildContext } from '../types';

export function createMenus(ctx: BuildContext, c: string[]) {
  c.push(`export const menus = {`);
  for (const i of ctx.menus) {
    c.push(`  ${JSON.stringify(i.pathname)}: ${JSON.stringify(i)},`);
  }
  c.push(`};`);
}
