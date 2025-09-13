import { createContextId } from '@qwik.dev/core';
import type { PkgManagers } from './components/package-manager-tabs';

export interface SiteStore {
  headerMenuOpen: boolean;
  sideMenuOpen: boolean;
  pkgManager: PkgManagers;
}

export const GlobalStore = createContextId<SiteStore>('site-store');
