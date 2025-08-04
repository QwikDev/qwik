import { createContextId } from '@qwik.dev/core';

export interface SiteStore {
  headerMenuOpen: boolean;
  sideMenuOpen: boolean;
}

export const GlobalStore = createContextId<SiteStore>('site-store');
