export type ReleaseStage = 'alpha' | 'beta' | 'rc' | 'stable' | 'minor' | 'next-major';

/** Drops the `-dev+<sha>` stamp that non-release core builds (such as the docs deploy) add. */
export const getReleasedVersion = (version: string) => version.split('-dev')[0];

/** Places a published Qwik version, such as `2.0.0-rc.4`, on the roadmap's release track. */
export const getReleaseStage = (version: string): ReleaseStage => {
  const [major, minor] = version.split('.').map(Number);
  if (major > 2) {
    return 'next-major';
  }
  // Only the 2.0 train has alpha, beta and rc milestones; later 2.x prereleases are all "2.x".
  if (minor > 0) {
    return 'minor';
  }
  if (version.includes('-alpha')) {
    return 'alpha';
  }
  if (version.includes('-beta')) {
    return 'beta';
  }
  if (version.includes('-rc')) {
    return 'rc';
  }
  return 'stable';
};
