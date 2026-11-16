type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readGuidePreference(storage: GuideStorage, report: string): boolean {
  try {
    return storage.getItem(`insights:guide:${report}`) === 'open';
  } catch {
    return false;
  }
}

export function saveGuidePreference(storage: GuideStorage, report: string, isOpen: boolean) {
  try {
    storage.setItem(`insights:guide:${report}`, isOpen ? 'open' : 'closed');
  } catch {
    // Guidance remains usable when browser storage is blocked.
  }
}
