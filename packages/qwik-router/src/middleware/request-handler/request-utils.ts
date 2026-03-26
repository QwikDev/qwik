export const encoder = /*#__PURE__*/ new TextEncoder();

export function getContentType(headers: Headers): string {
  return (headers.get('content-type')?.split(/[;,]/, 1)[0].trim() ?? '').toLowerCase();
}

export function isContentType(headers: Headers, ...types: string[]) {
  const type = getContentType(headers);
  for (let i = 0; i < types.length; i++) {
    if (types[i].toLowerCase() === type) {
      return true;
    }
  }
  return false;
}
