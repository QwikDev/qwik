import { $, Slot, component$, useContext, useTask$ } from '@builder.io/qwik';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import { Tab, TabList, TabPanel, Tabs } from '@qwik-ui/headless';
import type { CookieOptions } from 'express';
import { GlobalStore } from '../../context';
import { BunIcon } from './BunIcon';
import { NpmIcon } from './NpmIcon';
import { PnpmIcon } from './PnpmIcon';
import { YarnIcon } from './YarnIcon';

export type PackageManagers = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface IconProps {
  width?: number;
  height?: number;
}

const getCookie = (name: string) => {
  const cookieName = name + '=';
  const cookies = decodeURIComponent(document.cookie).split(';');
  for (let i = 0; i < cookies.length; i++) {
    let cookie = cookies[i];
    while (cookie.charAt(0) == ' ') {
      cookie = cookie.substring(1, cookie.length);
    }
    if (cookie.indexOf(cookieName) == 0) {
      return cookie.substring(cookieName.length, cookie.length);
    }
  }
  return null;
};

const setCookie = (name: string, value: string, options: CookieOptions = {}) => {
  let cookieString = `${name}=${encodeURIComponent(value)}`;
  const expires = options.expires ? `; expires=${options.expires.toUTCString()}` : '';
  const path = options.path ? `; path=${options.path}` : '';
  const domain = options.domain ? `; domain=${options.domain}` : '';
  const secure = options.secure ? '; secure' : '';
  const httpOnly = options.httpOnly ? '; HttpOnly' : '';

  cookieString += expires + path + domain + secure + httpOnly;

  document.cookie = cookieString;
};

export default component$(() => {
  const globalStore = useContext(GlobalStore);

  useTask$(({ track }) => {
    if (isServer) {
      return;
    }
    track(() => globalStore.pkgManager);
    const packageManager = getCookie('packageManager') as PackageManagers;
    if (!packageManager) {
      setCookie('packageManager', 'npm', {
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'strict',
        path: '/',
        secure: true,
      });
      return;
    }
    globalStore.pkgManager = packageManager;
  });

  const handleTabChange = $((manager: string) => {
    if (isBrowser) {
      globalStore.pkgManager = manager as PackageManagers;
      setCookie('packageManager', manager, {
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'strict',
        path: '/',
        secure: true,
      });
    }
  });

  return (
    // @ts-ignore
    <Tabs selectedTabId={globalStore.pkgManager} onSelectedTabIdChange$={handleTabChange}>
      <TabList>
        <Tab
          tabId="npm"
          class={`px-4 py-2 rounded-md ${
            globalStore.pkgManager === 'npm'
              ? 'bg-[#011f33] hover:bg-none font-bold text-white'
              : globalStore.theme === 'light'
                ? 'hover:bg-[var(--qwik-light-blue)] text-black'
                : 'hover:bg-[var(--on-this-page-hover-bg-color)] text-white'
          }`}
        >
          <span class="inline-flex items-center gap-x-2">
            <NpmIcon />
            npm
          </span>
        </Tab>
        <Tab
          tabId="yarn"
          class={`px-4 py-2 rounded-md ${
            globalStore.pkgManager === 'yarn'
              ? 'bg-[#011f33] hover:bg-none font-bold text-white'
              : globalStore.theme === 'light'
                ? 'hover:bg-[var(--qwik-light-blue)] text-black'
                : 'hover:bg-[var(--on-this-page-hover-bg-color)] text-white'
          }`}
        >
          <span class="inline-flex items-center gap-x-2">
            <YarnIcon />
            yarn
          </span>
        </Tab>
        <Tab
          tabId="pnpm"
          class={`px-4 py-2 rounded-md ${
            globalStore.pkgManager === 'pnpm'
              ? 'bg-[#011f33] hover:bg-none font-bold text-white'
              : globalStore.theme === 'light'
                ? 'hover:bg-[var(--qwik-light-blue)] text-black'
                : 'hover:bg-[var(--on-this-page-hover-bg-color)] text-white'
          }`}
        >
          <span class="inline-flex items-center gap-x-2">
            <PnpmIcon />
            pnpm
          </span>
        </Tab>
        <Tab
          tabId="bun"
          class={`px-4 py-2 rounded-md ${
            globalStore.pkgManager === 'bun'
              ? 'bg-[#011f33] hover:bg-none font-bold text-white'
              : globalStore.theme === 'light'
                ? 'hover:bg-[var(--qwik-light-blue)] text-black'
                : 'hover:bg-[var(--on-this-page-hover-bg-color)] text-white'
          }`}
        >
          <span class="inline-flex items-center gap-x-2">
            <BunIcon />
            bun
          </span>
        </Tab>
      </TabList>

      <TabPanel>
        <Slot name="npm" />
      </TabPanel>
      <TabPanel>
        <Slot name="yarn" />
      </TabPanel>
      <TabPanel>
        <Slot name="pnpm" />
      </TabPanel>
      <TabPanel>
        <Slot name="bun" />
      </TabPanel>
    </Tabs>
  );
});
