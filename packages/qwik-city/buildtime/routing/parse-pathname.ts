import type { ParsedPathname, PathnameSegmentPart } from '../types';

/**
 * Adopted from SvelteKit
 * https://github.com/sveltejs/kit/blob/master/LICENSE
 */
export function parseRoutePathname(basePathname: string, pathname: string): ParsedPathname {
  if (pathname === basePathname) {
    return {
      pattern: new RegExp('^' + pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
      paramNames: [],
      segments: [[{ content: '', dynamic: false, rest: false }]],
    };
  }

  pathname = pathname.slice(1);

  const segments = pathname.split('/');
  const paramNames: string[] = [];
  let addTrailingSlash = true;

  const pattern = new RegExp(
    `^${segments
      .filter((segment) => segment.length > 0)
      .map((s, i, segments) => {
        const segment = decodeURIComponent(s);

        // special case — /[...rest]/ could contain zero segments
        const catchAll = /^\[\.\.\.(\w+)?\]$/.exec(segment);
        if (catchAll) {
          paramNames.push(catchAll[1]);
          return '(?:/(.*))?';
        }

        const isLast = i === segments.length - 1;

        return (
          '/' +
          segment
            .split(DYNAMIC_SEGMENT)
            .map((content, i) => {
              if (i % 2) {
                const rg = PARAM_PATTERN.exec(content);
                if (rg) {
                  const [, rest, name] = rg;
                  paramNames.push(name);
                  return rest ? '(.*?)' : '([^/]+?)';
                }
              }

              // TODO, remove once basepath is refactored
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

  return {
    pattern,
    paramNames,
    segments: segments.map((segment) => {
      const parts: PathnameSegmentPart[] = [];
      segment.split(/\[(.+?)\]/).map((content, i) => {
        if (content) {
          const dynamic = !!(i % 2);
          parts.push({
            content,
            dynamic,
            rest: dynamic && content.startsWith('...'),
          });
        }
      });
      return parts;
    }),
  };
}

const PARAM_PATTERN = /^(\.\.\.)?(\w+)?$/;
const DYNAMIC_SEGMENT = /\[(.+?)\]/;
