import { $, Slot, component$, isBrowser, useContext, useSignal } from '@qwik.dev/core';
import { tabs, lucide, devicon } from '@qds.dev/ui';
import { GlobalStore } from '../../context';

const pkgManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const;
export type PkgManagers = (typeof pkgManagers)[number];

const pkgManagerStorageKey = 'pkg-manager-preference';

const setPreference = (value: PkgManagers) => {
  if (isBrowser) {
    localStorage.setItem(pkgManagerStorageKey, value);
  }
};

export const getPkgManagerPreference = () => {
  try {
    return (localStorage.getItem(pkgManagerStorageKey) || 'pnpm') as PkgManagers;
  } catch (err) {
    return 'pnpm';
  }
};

export default component$(() => {
  const globalStore = useContext(GlobalStore);

  return (
    <tabs.root
      value={globalStore.pkgManager}
      onChange$={(value) => {
        const pkg = value as PkgManagers;
        globalStore.pkgManager = pkg;
        setPreference(pkg);
      }}
      class="flex flex-col items-start"
    >
      <tabs.list class="flex items-end relative z-1 -mb-3">
        {pkgManagers.map((pkg, i) => (
          <tabs.trigger
            key={pkg}
            value={pkg}
            class={[
              'flex items-center gap-2 px-4 pt-2 pb-5 rounded-t-lg border-[1.6px] border-base -mr-2 cursor-pointer',
              'text-body-sm font-semibold',
              'bg-background-base text-standalone-base',
              'ui-selected:bg-background-emphasis ui-selected:border-border-emphasis ui-selected:text-standalone-emphasis ui-selected:font-bold',
            ]}
            style={{ zIndex: pkgManagers.length - i }}
          >
            {pkg === 'pnpm' && <devicon.pnpm class="size-6" />}
            {pkg === 'npm' && <devicon.npm class="size-6" />}
            {pkg === 'yarn' && <devicon.yarn class="size-6" />}
            {pkg === 'bun' && <devicon.bun class="size-6" />}
            <span>{pkg}</span>
          </tabs.trigger>
        ))}
      </tabs.list>

      {pkgManagers.map((pkg) => (
        <tabs.content key={pkg} value={pkg} class="relative w-full z-2">
          <Slot name={pkg} />
          <CopyButton />
        </tabs.content>
      ))}
    </tabs.root>
  );
});

const CopyButton = component$(() => {
  const isClickedSig = useSignal(false);

  const copyToClipboard$ = $((_: Event, target: HTMLButtonElement) => {
    isClickedSig.value = true;

    const activePanel = target.parentElement;
    if (activePanel) {
      const content = activePanel.textContent || '';
      navigator.clipboard.writeText(content);
    }

    setTimeout(() => {
      isClickedSig.value = false;
    }, 3000);
  });

  return (
    <button
      onClick$={copyToClipboard$}
      class="absolute right-4 top-4 cursor-pointer text-standalone-base opacity-50 transition duration-300 ease hover:opacity-100"
      aria-label={isClickedSig.value ? 'Copied to clipboard' : 'Copy to clipboard'}
      title={isClickedSig.value ? 'Copied!' : 'Copy to clipboard'}
    >
      {isClickedSig.value ? (
        <lucide.check class="size-5" aria-hidden="true" />
      ) : (
        <lucide.copy class="size-5" aria-hidden="true" />
      )}
    </button>
  );
});
