export function normalizeExcludePathnames(pathnames: string[] | undefined): string[] {
  if (!pathnames) {
    return [];
  }

  return [...new Set(pathnames.map(normalizeExcludePathname).filter(Boolean))];
}

function normalizeExcludePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) {
    return '';
  }

  const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return prefixed.length > 1 ? prefixed.replace(/\/+$/, '') : prefixed;
}

export function isExcludedPathname(pathname: string, excludePathnames: string[]): boolean {
  return normalizeExcludePathnames(excludePathnames).some((excludedPathname) => {
    return pathname === excludedPathname || pathname.startsWith(excludedPathname + '/');
  });
}
