import { normalizePath } from '../../buildtime/utils/fs';
import type { NormalizedStaticGeneratorOptions, StaticGeneratorOptions } from './types';

export function normalizeOptions(input: StaticGeneratorOptions | undefined) {
  const output: NormalizedStaticGeneratorOptions = { ...input } as any;

  output.ourDir = normalizePath(output.ourDir);

  if (output.sitemapOutFile === undefined) {
    output.sitemapOutFile = 'sitemap.xml';
  }

  const baseUrl = new URL(output.baseUrl);
  baseUrl.hash = '';
  baseUrl.search = '';
  output.baseUrl = baseUrl.href;

  if (!Array.isArray(output.urls)) {
    output.urls = [output.baseUrl];
  }
  output.urls = output.urls
    .map((url) => normalizePathname(url, baseUrl)!)
    .filter((url) => typeof url === 'string');

  if (typeof output.crawl !== 'boolean') {
    output.crawl = true;
  }

  if (typeof output.maxTasksPerWorker !== 'number') {
    output.maxTasksPerWorker = MAX_TASKS_PER_WORKER;
  }

  return output;
}

const MAX_TASKS_PER_WORKER = 20;

export function normalizePathname(url: string, baseUrl: URL) {
  if (typeof url === 'string') {
    try {
      const u = new URL(url, baseUrl);
      if (u.origin === baseUrl.origin) {
        return u.pathname;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return null;
}

export function collectAnchorHrefs(b: { c: string }, links: Set<string>, url: URL) {
  while (b.c.length > 8) {
    const scriptStart = b.c.indexOf('<script');
    if (scriptStart === 0) {
      const scriptEnd = b.c.indexOf('</script>');
      if (scriptEnd === -1) {
        break;
      }
      b.c = b.c.slice(scriptEnd + 9);
      continue;
    }

    const templateStart = b.c.indexOf('<template');
    if (templateStart === 0) {
      const templateEnd = b.c.indexOf('</template>');
      if (templateEnd === -1) {
        break;
      }
      b.c = b.c.slice(templateEnd + 11);
      continue;
    }

    const anchorStart = b.c.indexOf('<a ');
    if (scriptStart > -1) {
      if (anchorStart > -1 && scriptStart < anchorStart) {
        b.c = b.c.slice(scriptStart);
        continue;
      }
    }

    if (templateStart > -1) {
      if (anchorStart > -1 && templateStart < anchorStart) {
        b.c = b.c.slice(templateStart);
        continue;
      }
    }

    if (anchorStart === -1) {
      b.c = '';
      break;
    }

    b.c = b.c.slice(anchorStart);
    const anchorEnd = b.c.indexOf('>');
    if (anchorEnd === -1) {
      break;
    }

    const anchor = b.c.slice(0, anchorEnd);
    b.c = b.c.slice(anchorEnd + 1);

    const hrefStart = anchor.indexOf('href');
    if (hrefStart > -1) {
      const href = anchor.slice(hrefStart + 4);
      const hrefLen = href.length;
      let value = '';
      let hasEqual = false;

      for (let i = 0; i < hrefLen; i++) {
        const char = href.charAt(i);

        if (hasEqual) {
          value = href.slice(i);
          break;
        } else {
          if (char === '=') {
            hasEqual = true;
          } else if (char !== ' ' && char !== '\n' && char !== '\t') {
            break;
          }
        }
      }

      value = value.trim();
      if (value !== '') {
        const char = value.charAt(0);

        if (char === `"`) {
          value = value.slice(1);
          value = value.slice(0, value.indexOf(`"`));
        } else if (char === `'`) {
          value = value.slice(1);
          value = value.slice(0, value.indexOf(`'`));
        } else {
          value = value.split(' ').shift()!;
        }

        if (value !== '' && value.charAt(0) !== '{') {
          const hrefUrl = new URL(value, url);
          if (hrefUrl.origin === url.origin && hrefUrl.pathname !== url.pathname) {
            links.add(hrefUrl.pathname);
          }
        }
      }
    }
  }
}
