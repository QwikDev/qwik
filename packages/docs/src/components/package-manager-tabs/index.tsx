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
      class="flex w-full min-w-0 flex-col items-start"
    >
      <tabs.list class="relative z-1 -mb-3 flex w-full min-w-0 items-end overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {pkgManagers.map((pkg, i) => (
          <tabs.trigger
            key={pkg}
            value={pkg}
            class={['attached-tab', 'ui-selected:attached-tab-selected']}
            style={{ zIndex: pkgManagers.length - i }}
          >
            {pkg === 'pnpm' && <devicon.pnpm class="size-5 sm:size-6" />}
            {pkg === 'npm' && <devicon.npm class="size-5 sm:size-6" />}
            {pkg === 'yarn' && <devicon.yarn class="size-5 sm:size-6" />}
            {pkg === 'bun' && <devicon.bun class="size-5 sm:size-6" />}
            <span>{pkg}</span>
          </tabs.trigger>
        ))}
      </tabs.list>

      {pkgManagers.map((pkg) => (
        <tabs.content key={pkg} value={pkg} class="relative z-2 w-full min-w-0">
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
      class="absolute right-4 top-4 cursor-pointer"
      aria-label={isClickedSig.value ? 'Copied to clipboard' : 'Copy to clipboard'}
      title={isClickedSig.value ? 'Copied!' : 'Copy to clipboard'}
    >
      {isClickedSig.value ? (
        <lucide.check class="vanilla-icon" aria-hidden="true" />
      ) : (
        <lucide.copy class="vanilla-icon" aria-hidden="true" />
      )}
    </button>
  );
});
