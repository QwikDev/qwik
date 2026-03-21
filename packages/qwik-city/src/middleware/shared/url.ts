const LEADING_DOUBLE_SLASH_REG = /^[\\/]{2,}/;

export function normalizeRequestUrl(url: string, base: string) {
  // defined in function because of lastIndex gotcha with /g
  const DOUBLE_SLASH_REG = /\/\/|\\\\/g;
  const queryOrHashIndex = url.search(/[?#]/);
  const path = queryOrHashIndex === -1 ? url : url.slice(0, queryOrHashIndex);
  const suffix = queryOrHashIndex === -1 ? '' : url.slice(queryOrHashIndex);

  // do not allow the url to have a relative protocol url
  // which could bypass of CSRF protections
  // for example: new URL("//attacker.com", "https://qwik.build.io")
  // would return "https://attacker.com" when it should be "https://qwik.build.io/attacker.com"
  return new URL(
    `${path.replace(LEADING_DOUBLE_SLASH_REG, '/').replace(DOUBLE_SLASH_REG, '/')}${suffix}`,
    base
  );
}
