import { createContextId } from '@qwik.dev/core';
import type { ThemePreference } from './components/theme-toggle';
import type { PkgManagers } from './components/package-manager-tabs';

export interface SiteStore {
  headerMenuOpen: boolean;
  sideMenuOpen: boolean;
  /** @deprecated Only use this if you cannot use CSS with `:root[data-theme='dark']` */
  theme: ThemePreference | 'auto';
  pkgManager: PkgManagers;
}

export const GlobalStore = createContextId<SiteStore>('site-store');
