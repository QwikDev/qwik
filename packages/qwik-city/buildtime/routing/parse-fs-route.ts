import { createMenu, isMenuFileName } from '../markdown/menu';
import type { BuildContext } from '../types';
import { addError } from '../utils/format';
import {
  IGNORE_FS_NAMES,
  isEndpointFileName,
  isMarkdownFileName,
  isPageFileName,
  isTestDirName,
  isTestFileName,
} from '../utils/fs';
import { createEndpointRoute } from './endpoint';
import { createLayout, isLayoutFileName } from './layout';
import { createPageRoute } from './page';

export function parseFsRoute(
  ctx: BuildContext,
  dirPath: string,
  dirName: string,
  filePath: string,
  fileName: string
) {
  if (IGNORE_FS_NAMES[fileName]) {
    return true;
  }

  if (isTestDirName(fileName)) {
    addError(
      ctx,
      `Test directory "${filePath}" should not be included within the routes directory. Please move test directories to a different location.`
    );
    return true;
  }

  if (isTestFileName(fileName)) {
    addError(
      ctx,
      `Test file "${filePath}" should not be included within the routes directory. Please move test files to a different location.`
    );
    return true;
  }

  if (isLayoutFileName(dirName, fileName)) {
    const layout = createLayout(ctx, dirPath, dirName, filePath);
    ctx.layouts.push(layout);
    return true;
  }

  if (isMenuFileName(fileName)) {
    const menu = createMenu(ctx, filePath);
    ctx.menus.push(menu);
    return true;
  }

  if (isEndpointFileName(fileName)) {
    const endpointRoute = createEndpointRoute(ctx, filePath);
    ctx.routes.push(endpointRoute);
    return true;
  }

  if (isMarkdownFileName(fileName)) {
    const markdownRoute = createPageRoute(ctx, filePath, 'markdown');
    ctx.routes.push(markdownRoute);
    return true;
  }

  if (isPageFileName(fileName)) {
    const pageRoute = createPageRoute(ctx, filePath, 'module');
    ctx.routes.push(pageRoute);
    return true;
  }

  return false;
}
