import { basename, dirname } from 'path';
import type { PageLayout, ParsedPage } from '../types';
import { toTitleCase } from '../utils/format';
import { normalizePath } from '../utils/fs';

export function parseLayoutFile(rootDir: string, filePath: string) {
  const path = normalizePath(filePath);
  const layoutDir = normalizePath(dirname(filePath));

  const layout: PageLayout = {
    id: createLayoutId(rootDir, layoutDir),
    path,
    name: basename(layoutDir),
    dir: layoutDir,
  };
  return layout;
}

export function createLayoutId(rootDir: string, layoutDir: string) {
  const segments: string[] = [];

  while (layoutDir.length > rootDir.length) {
    const dirName = basename(layoutDir);
    segments.push(dirName);
    layoutDir = normalizePath(dirname(layoutDir));
  }

  segments.reverse();

  if (segments.length > 1 && segments[0] === 'src') {
    segments.shift();
  }

  return (
    'Layout' +
    segments
      .map((id, index) => {
        id = id.replace(/[\W_]+/g, '');
        if (id === '') {
          id = 'L' + index;
        }
        return toTitleCase(id);
      })
      .join('')
  );
}

export function updatePageLayouts(rootDir: string, pages: ParsedPage[], layouts: PageLayout[]) {
  for (const page of pages) {
    let pageDir = normalizePath(dirname(page.path));

    while (pageDir.length > rootDir.length) {
      const layout = layouts.find((l) => l.dir === pageDir);
      if (layout) {
        page.layouts.push({ ...layout });
      }
      pageDir = normalizePath(dirname(pageDir));
    }

    page.layouts.reverse();
  }
}
