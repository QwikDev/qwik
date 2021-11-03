import type { Manifest, TransformedOutput } from '.';

export function getTransformedEntryPaths(
  transformedOutputs: Map<string, TransformedOutput>,
  manifest?: Manifest
) {
  const transformedEntryPaths = Array.from(transformedOutputs.keys()).sort();

  return transformedEntryPaths;
}
