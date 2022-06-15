/**
 * Adopted from SvelteKit
 * https://github.com/sveltejs/kit/blob/master/LICENSE
 */
export function parseRouteId(id: string) {
  const paramNames: string[] = [];
  const paramTypes: string[] = [];

  let addTrailingSlash = true;

  if (id.charAt(0) === '/') {
    id = id.slice(1);
  }

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
                paramNames.push(match[1]);
                paramTypes.push(match[2]);
                return '(?:/(.*))?';
              }

              const isLast = i === segments.length - 1;

              return (
                '/' +
                segment
                  .split(/\[(.+?)\]/)
                  .map((content, i) => {
                    if (i % 2) {
                      const rg = PARAM_PATTERN.exec(content);
                      if (rg) {
                        const [, rest, name, type] = rg;
                        paramNames.push(name);
                        paramTypes.push(type);
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

  return { pattern, paramNames, paramTypes };
}

const PARAM_PATTERN = /^(\.\.\.)?(\w+)(?:=(\w+))?$/;
