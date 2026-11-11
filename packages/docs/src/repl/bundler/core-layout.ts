/** Published versions after 2.0.0-rc.5 ship core as a Qwik library, `core.qwik.mjs`. */
export const shipsCoreAsQwikLibrary = (version: string) => {
  const [release, pre] = version.split('-');
  const [major, minor, patch] = release.split('.').map(Number);
  if (major !== 2 || minor !== 0 || patch !== 0) {
    return major > 2 || (major === 2 && (minor > 0 || patch > 0));
  }
  const [tag, number] = (pre ?? '').split('.');
  return !pre || (tag === 'rc' && Number(number) > 5);
};
