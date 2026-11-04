export type ReleaseStage = 'alpha' | 'beta' | 'rc' | 'stable' | 'minor';

/** Drops the `-dev+<sha>` stamp that non-release core builds (such as the docs deploy) add. */
export const getReleasedVersion = (version: string) => version.split('-dev')[0];

/** Places a published Qwik version, such as `2.0.0-rc.4`, on the roadmap's release track. */
export const getReleaseStage = (version: string): ReleaseStage => {
  if (version.includes('-alpha')) {
    return 'alpha';
  }
  if (version.includes('-beta')) {
    return 'beta';
  }
  if (version.includes('-rc')) {
    return 'rc';
  }
  const minor = version.split('.')[1];
  return minor === '0' ? 'stable' : 'minor';
};
