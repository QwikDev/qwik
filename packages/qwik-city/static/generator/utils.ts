export function normalizePathname(url: string | undefined | null, baseUrl: URL) {
  if (typeof url === 'string') {
    url = url.trim();
    if (url !== '') {
      try {
        const u = new URL(url, baseUrl);
        if (u.origin === baseUrl.origin) {
          return u.pathname;
        }
      } catch (e) {
        console.error(e);
      }
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

    const lastChar = b.c.charAt(b.c.length - 1);
    if (lastChar === '<' || /\s/.test(lastChar)) {
      break;
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
          } else if (!/\s/.test(char)) {
            break;
          }
        }
      }

      value = value.trim();
      if (value !== '') {
        const charCode = value.charCodeAt(0);

        if (charCode === DOUBLE_QUOTE) {
          value = value.slice(1);
          value = value.slice(0, value.indexOf(`"`));
        } else if (charCode === SINGLE_QUOTE) {
          value = value.slice(1);
          value = value.slice(0, value.indexOf(`'`));
        } else {
          value = value.split(' ').shift()!;
        }

        if (value !== '' && value.charCodeAt(0) !== LEFT_CURLY_BRACKET) {
          const pathname = normalizePathname(value, url);
          if (pathname) {
            links.add(pathname);
          }
        }
      }
    }
  }
}

export function msToString(ms: number) {
  if (ms < 1) {
    return ms.toFixed(2) + ' ms';
  }
  if (ms < 1000) {
    return ms.toFixed(1) + ' ms';
  }
  if (ms < 60000) {
    return (ms / 1000).toFixed(1) + ' s';
  }
  return (ms / 60000).toFixed(1) + ' m';
}

const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;
const LEFT_CURLY_BRACKET = 123;
