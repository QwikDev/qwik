import { createContextId } from '@qwik.dev/core';
import type { ThemePreference } from './components/theme-toggle/theme-toggle';
import type { PkgManagers } from './components/package-manager-tabs';

export interface SiteStore {
  headerMenuOpen: boolean;
  sideMenuOpen: boolean;
  theme: ThemePreference | 'auto';
  pkgManager: PkgManagers;
}

export const GlobalStore = createContextId<SiteStore>('site-store');
