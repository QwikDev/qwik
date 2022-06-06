import type { NormalizedPluginOptions, PageRoute, ParamMatcher } from '../types';
import { getPagePathname } from './pathname';

export function parsePageRoute(opts: NormalizedPluginOptions, filePath: string) {
  const pathname = getPagePathname(opts, filePath);

  const route = parseRouteId(pathname);

  const pageRoute: PageRoute = {
    pathname,
    ...route,
  };

  return pageRoute;
}

/**
 * Adopted from SvelteKit
 * https://github.com/sveltejs/kit/blob/master/LICENSE
 */
export function parseRouteId(id: string) {
  const names: string[] = [];
  const types: string[] = [];

  let addTrailingSlash = true;

  const pattern =
    id === ''
      ? /^\/$/
      : new RegExp(
          `^${decodeURIComponent(id)
            .split('/')
            .map((segment, i, segments) => {
              // special case — /[...rest]/ could contain zero segments
              const match = /^\[\.\.\.(\w+)(?:=(\w+))?\]$/.exec(segment);
              if (match) {
                names.push(match[1]);
                types.push(match[2]);
                return '(?:/(.*))?';
              }

              const isLast = i === segments.length - 1;

              return (
                '/' +
                segment
                  .split(/\[(.+?)\]/)
                  .map((content, i) => {
                    if (i % 2) {
                      const rg = PARAM_PATTER.exec(content);
                      if (rg) {
                        const [, rest, name, type] = rg;
                        names.push(name);
                        types.push(type);
                        return rest ? '(.*?)' : '([^/]+?)';
                      }
                    }

                    if (isLast && content.includes('.')) {
                      addTrailingSlash = false;
                    }

                    return (
                      content // allow users to specify characters on the file system in an encoded manner
                        .normalize()
                        // We use [ and ] to denote parameters, so users must encode these on the file
                        // system to match against them. We don't decode all characters since others
                        // can already be epressed and so that '%' can be easily used directly in filenames
                        .replace(/%5[Bb]/g, '[')
                        .replace(/%5[Dd]/g, ']')
                        // '#', '/', and '?' can only appear in URL path segments in an encoded manner.
                        // They will not be touched by decodeURI so need to be encoded here, so
                        // that we can match against them.
                        // We skip '/' since you can't create a file with it on any OS
                        .replace(/#/g, '%23')
                        .replace(/\?/g, '%3F')
                        // escape characters that have special meaning in regex
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    ); // TODO handle encoding
                  })
                  .join('')
              );
            })
            .join('')}${addTrailingSlash ? '/?' : ''}$`
        );

  return { pattern, names, types };
}

export function exec(
  match: RegExpMatchArray,
  names: string[],
  types: string[],
  matchers: Record<string, ParamMatcher>
) {
  const params: Record<string, string> = {};

  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const type = types[i];
    const value = match[i + 1] || '';

    if (type) {
      const matcher = matchers[type];
      if (!matcher) {
        throw new Error(`Missing "${type}" param matcher`);
      }
      if (!matcher(value)) {
        return;
      }
    }

    params[name] = value;
  }

  return params;
}

const PARAM_PATTER = /^(\.\.\.)?(\w+)(?:=(\w+))?$/;
