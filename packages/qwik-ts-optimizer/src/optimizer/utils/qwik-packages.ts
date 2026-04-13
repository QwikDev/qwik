const QWIK_PACKAGE_PREFIXES = [
  '@qwik.dev/core',
  '@qwik.dev/react',
  '@qwik.dev/router',
  '@builder.io/qwik-react',
  '@builder.io/qwik-city',
  '@builder.io/qwik',
];

/** Check whether an import source belongs to a Qwik package or subpath. */
export function isQwikPackageSource(source: string): boolean {
  return QWIK_PACKAGE_PREFIXES.some(
    (prefix) => source === prefix || source.startsWith(prefix + '/'),
  );
}
