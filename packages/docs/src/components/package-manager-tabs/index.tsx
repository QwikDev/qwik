import { Tabs } from '@qwik-ui/headless';
import {
  $,
  Slot,
  component$,
  isBrowser,
  useContext,
  useSignal,
  type PropsOf,
} from '@qwik.dev/core';
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

  const activeClass = `font-bold bg-(--color-tab-active-bg) text-(--color-tab-active-text)`;

  return (
    <Tabs.Root
      selectedTabId={globalStore.pkgManager}
      onSelectedTabIdChange$={(pkgManager) => {
        const value = pkgManager as PkgManagers;
        globalStore.pkgManager = value;
        setPreference(value);
      }}
    >
      <Tabs.List>
        <Tabs.Tab
          tabId="pnpm"
          class={`px-4 pt-2 rounded-md ${globalStore.pkgManager === 'pnpm' ? activeClass : ''}`}
        >
          <span class="inline-flex items-center gap-x-2">
            <PnpmIcon />
            <span>pnpm</span>
          </span>
        </Tabs.Tab>
        <Tabs.Tab
          tabId="npm"
          class={`px-4 pt-2 rounded-md ${globalStore.pkgManager === 'npm' ? activeClass : ''}`}
        >
          <span class="inline-flex items-center gap-x-2">
            <NpmIcon />
            <span>npm</span>
          </span>
        </Tabs.Tab>
        <Tabs.Tab
          tabId="yarn"
          class={`px-4 pt-2 rounded-md ${globalStore.pkgManager === 'yarn' ? activeClass : ''}`}
        >
          <span class="inline-flex items-center gap-x-2">
            <YarnIcon />
            <span>yarn</span>
          </span>
        </Tabs.Tab>
        <Tabs.Tab
          tabId="bun"
          class={`px-4 pt-2 rounded-md ${globalStore.pkgManager === 'bun' ? activeClass : ''}`}
        >
          <span class="inline-flex items-center gap-x-2">
            <BunIcon />
            <span>bun</span>
          </span>
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel class="relative">
        <Slot name="pnpm" />
        <CopyButton />
      </Tabs.Panel>
      <Tabs.Panel class="relative">
        <Slot name="npm" />
        <CopyButton />
      </Tabs.Panel>
      <Tabs.Panel class="relative">
        <Slot name="yarn" />
        <CopyButton />
      </Tabs.Panel>
      <Tabs.Panel class="relative">
        <Slot name="bun" />
        <CopyButton />
      </Tabs.Panel>
    </Tabs.Root>
  );
});

// TODO: refactor qwik ui tabs to pass in refs and allow content inside of the tabs root (for example, absolute positioning)
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
      class="px-5 rounded-sm absolute right-0 top-0 text-white h-full group"
      aria-label={isClickedSig.value ? 'Copied to clipboard' : 'Copy to clipboard'}
      title={isClickedSig.value ? 'Copied!' : 'Copy to clipboard'}
    >
      {isClickedSig.value ? (
        <CheckIcon class="w-6 h-6" aria-hidden="true" />
      ) : (
        <CopyIcon
          class="w-6 h-6 transition duration-300 ease group-hover:opacity-100 text-white opacity-50"
          aria-hidden="true"
        />
      )}
    </button>
  );
});

const CopyIcon = component$((props: PropsOf<'svg'>) => {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      <path
        fill="currentColor"
        d="M9 18q-.825 0-1.412-.587T7 16V4q0-.825.588-1.412T9 2h9q.825 0 1.413.588T20 4v12q0 .825-.587 1.413T18 18zm-4 4q-.825 0-1.412-.587T3 20V7q0-.425.288-.712T4 6t.713.288T5 7v13h10q.425 0 .713.288T16 21t-.288.713T15 22z"
      ></path>
    </svg>
  );
});

const CheckIcon = component$((props: PropsOf<'svg'>) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" {...props}>
      <path
        fill="currentColor"
        d="m9.55 15.15l8.475-8.475q.3-.3.7-.3t.7.3t.3.713t-.3.712l-9.175 9.2q-.3.3-.7.3t-.7-.3L4.55 13q-.3-.3-.288-.712t.313-.713t.713-.3t.712.3z"
      />
    </svg>
  );
});

const PnpmIcon = component$((props: PropsOf<'svg'>) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256" {...props}>
      <g fill="none">
        <g clip-path="url(#skillIconsPnpmLight0)">
          <path
            fill="#F4F2ED"
            d="M196 0H60C26.863 0 0 26.863 0 60v136c0 33.137 26.863 60 60 60h136c33.137 0 60-26.863 60-60V60c0-33.137-26.863-60-60-60"
          />
          <path
            fill="#F9AD00"
            d="M40 41h55v55H40zm60 0h55v55h-55zm60 0h55v55h-55zm0 60h55v55h-55z"
          />
          <path fill="#4E4E4E" d="M160 161h55v55h-55zm-60 0h55v55h-55zm-60 0h55v55H40z" />
          <path fill="#F4F2ED" d="M40 101h55v55H40z" />
          <path fill="#4E4E4E" d="M100 101h55v55h-55z" />
        </g>
        <defs>
          <clipPath id="skillIconsPnpmLight0">
            <path fill="#fff" d="M0 0h256v256H0z" />
          </clipPath>
        </defs>
      </g>
    </svg>
  );
});

const YarnIcon = component$((props: PropsOf<'svg'>) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256" {...props}>
      <path
        fill="#368FB9"
        d="M128 0C57.328 0 0 57.328 0 128s57.328 128 128 128s128-57.328 128-128S198.672 0 128 0"
      />
      <path
        fill="#FFF"
        d="M203.317 174.06c-7.907 1.878-11.91 3.608-21.695 9.983c-15.271 9.884-31.976 14.48-31.976 14.48s-1.383 2.076-5.387 3.015c-6.918 1.68-32.963 3.114-35.335 3.163c-6.376.05-10.28-1.63-11.367-4.25c-3.311-7.907 4.744-11.367 4.744-11.367s-1.779-1.087-2.817-2.076c-.939-.939-1.927-2.816-2.224-2.125c-1.235 3.015-1.878 10.379-5.189 13.69c-4.547 4.596-13.146 3.064-18.236.395c-5.585-2.965.395-9.933.395-9.933s-3.015 1.779-5.436-1.878c-2.175-3.36-4.2-9.094-3.657-16.16c.593-8.056 9.587-15.865 9.587-15.865s-1.581-11.91 3.608-24.117c4.695-11.12 17.347-20.065 17.347-20.065s-10.626-11.762-6.672-22.338c2.57-6.92 3.608-6.87 4.448-7.166c2.965-1.137 5.831-2.373 7.957-4.695c10.625-11.466 24.166-9.292 24.166-9.292s6.425-19.52 12.356-15.715c1.828 1.186 8.401 15.814 8.401 15.814s7.018-4.102 7.809-2.57c4.25 8.254 4.744 24.019 2.866 33.607c-3.163 15.814-11.07 24.315-14.233 29.652c-.741 1.236 8.5 5.14 14.332 21.3c5.387 14.777.593 27.182 1.433 28.566c.148.247.198.346.198.346s6.177.494 18.582-7.166c6.622-4.102 14.48-8.698 23.425-8.797c8.65-.149 9.094 9.983 2.57 11.564m11.763-7.265c-.89-7.017-6.82-11.86-14.431-11.762c-11.367.148-20.905 6.03-27.231 9.934c-2.471 1.532-4.596 2.669-6.425 3.509c.395-5.733.05-13.245-2.916-21.498c-3.608-9.885-8.45-15.963-11.91-19.472c4.003-5.832 9.489-14.332 12.058-27.478c2.224-11.219 1.533-28.664-3.558-38.45c-1.038-1.976-2.767-3.41-4.942-4.003c-.89-.247-2.57-.741-5.881.198c-4.991-10.329-6.721-11.416-8.056-12.306c-2.767-1.779-6.029-2.174-9.093-1.038c-4.102 1.483-7.61 5.437-10.922 12.454a51.47 51.47 0 0 0-1.334 3.015c-6.277.445-16.161 2.718-24.513 11.762c-1.038 1.137-3.064 1.977-5.19 2.768h.05c-4.349 1.532-6.326 5.09-8.747 11.515c-3.361 8.994.098 17.84 3.508 23.574c-4.645 4.151-10.823 10.773-14.084 18.532c-4.053 9.588-4.498 18.978-4.35 24.068c-3.459 3.658-8.796 10.527-9.39 18.237c-.79 10.773 3.114 18.088 4.844 20.756c.494.791 1.038 1.434 1.63 2.076c-.197 1.334-.246 2.768.05 4.25c.643 3.46 2.817 6.277 6.128 8.056c6.524 3.46 15.617 4.942 22.635 1.433c2.52 2.669 7.117 5.239 15.469 5.239h.494c2.125 0 29.109-1.433 36.967-3.36c3.509-.841 5.93-2.324 7.512-3.658c5.04-1.582 18.977-6.326 32.123-14.826c9.291-6.03 12.504-7.315 19.423-8.995c6.72-1.63 10.922-7.759 10.082-14.53"
      />
    </svg>
  );
});

const NpmIcon = component$((props: PropsOf<'svg'>) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256" {...props}>
      <path fill="#C12127" d="M0 256V0h256v256z" />
      <path fill="#FFF" d="M48 48h160v160h-32V80h-48v128H48z" />
    </svg>
  );
});

const BunIcon = component$((props: PropsOf<'svg'>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="36.41"
      height="32"
      viewBox="0 0 256 225"
      {...props}
    >
      <path d="M228.747 65.588a38.198 38.198 0 0 0-1.62-1.62c-.55-.519-1.07-1.102-1.62-1.62c-.551-.52-1.07-1.102-1.62-1.62c-.551-.52-1.07-1.103-1.62-1.621c-.552-.519-1.07-1.102-1.62-1.62c-.552-.519-1.07-1.102-1.621-1.62c-.551-.52-1.07-1.102-1.62-1.62a85.744 85.744 0 0 1 25.632 59.819c0 53.695-54.505 97.377-121.519 97.377c-37.525 0-71.097-13.707-93.424-35.192l1.62 1.62l1.62 1.62l1.62 1.62l1.621 1.621l1.62 1.62l1.62 1.62l1.621 1.62c22.295 22.393 56.612 36.813 95.044 36.813c67.014 0 121.519-43.682 121.519-97.215c0-22.878-9.851-44.557-27.253-61.602" />
      <path
        fill="#FBF0DF"
        d="M234.937 114.066c0 49.288-50.779 89.243-113.418 89.243S8.101 163.354 8.101 114.066c0-30.558 19.443-57.552 49.32-73.56C87.3 24.498 105.9 8.101 121.52 8.101c15.62 0 28.97 13.384 64.097 32.405c29.878 16.008 49.32 43.002 49.32 73.56"
      />
      <path
        fill="#F6DECE"
        d="M234.937 114.066a70.222 70.222 0 0 0-2.593-18.73c-8.846 107.909-140.476 113.093-192.227 80.818a129.62 129.62 0 0 0 81.402 27.155c62.542 0 113.418-40.02 113.418-89.243"
      />
      <path
        fill="#FFFEFC"
        d="M77.87 34.576c14.484-8.684 33.733-24.984 52.658-25.017a30.104 30.104 0 0 0-9.009-1.458c-7.842 0-16.203 4.05-26.734 10.143c-3.662 2.139-7.453 4.504-11.472 6.967c-7.55 4.666-16.202 9.948-25.924 15.23c-30.85 16.69-49.288 44.201-49.288 73.625v3.856C27.74 48.542 63.417 43.261 77.87 34.576"
      />
      <path
        fill="#CCBEA7"
        d="M112.186 16.3a53.177 53.177 0 0 1-18.244 40.409c-.907.81-.194 2.365.972 1.912c10.92-4.245 25.665-16.948 19.443-42.58c-.259-1.459-2.17-1.07-2.17.259m7.356 0a52.626 52.626 0 0 1 5.217 43.65c-.388 1.134 1.005 2.106 1.783 1.166c7.096-9.073 13.286-27.09-5.25-46.534c-.94-.842-2.398.454-1.75 1.588zm8.944-.551a53.21 53.21 0 0 1 22.198 38.108a1.07 1.07 0 0 0 2.106.357c2.981-11.31 1.296-30.59-23.235-40.604c-1.296-.518-2.138 1.232-1.069 2.01zM68.666 49.45a54.894 54.894 0 0 0 33.928-29.164c.584-1.167 2.43-.713 2.14.583c-5.607 25.924-24.37 31.336-36.035 30.623c-1.232.032-1.2-1.685-.033-2.042"
      />
      <path d="M121.519 211.443C54.505 211.443 0 167.761 0 114.066c0-32.405 20.026-62.64 53.566-80.754c9.721-5.184 18.05-10.402 25.47-14.97c4.083-2.528 7.94-4.894 11.666-7.097C102.076 4.505 111.797 0 121.519 0c9.722 0 18.212 3.889 28.84 10.175c3.241 1.847 6.482 3.856 9.949 6.06c8.069 4.99 17.175 10.629 29.164 17.077c33.54 18.115 53.566 48.316 53.566 80.754c0 53.695-54.505 97.377-121.519 97.377m0-203.342c-7.842 0-16.203 4.05-26.734 10.143c-3.662 2.139-7.453 4.504-11.472 6.967c-7.55 4.666-16.202 9.948-25.924 15.23c-30.85 16.69-49.288 44.201-49.288 73.625c0 49.223 50.876 89.276 113.418 89.276c62.542 0 113.418-40.053 113.418-89.276c0-29.424-18.439-56.936-49.32-73.56c-12.25-6.48-21.81-12.573-29.554-17.369c-3.532-2.17-6.773-4.18-9.722-5.962c-9.818-5.833-16.98-9.074-24.822-9.074" />
      <path
        fill="#B71422"
        d="M144.365 137.722a28.938 28.938 0 0 1-9.463 15.263a22.068 22.068 0 0 1-12.962 6.092a22.165 22.165 0 0 1-13.383-6.092a28.938 28.938 0 0 1-9.333-15.263a2.333 2.333 0 0 1 2.593-2.625h39.988a2.333 2.333 0 0 1 2.56 2.625"
      />
      <path
        fill="#FF6164"
        d="M108.557 153.244a22.392 22.392 0 0 0 13.351 6.157a22.392 22.392 0 0 0 13.318-6.157a34.447 34.447 0 0 0 3.241-3.468a22.133 22.133 0 0 0-15.879-7.485a19.93 19.93 0 0 0-16.202 9.008c.745.681 1.393 1.33 2.171 1.945"
      />
      <path d="M109.076 150.684a17.37 17.37 0 0 1 13.577-6.74a19.443 19.443 0 0 1 12.962 5.476a51.225 51.225 0 0 0 2.139-2.495a22.684 22.684 0 0 0-15.263-6.254a20.61 20.61 0 0 0-15.846 7.647a30.882 30.882 0 0 0 2.43 2.366" />
      <path d="M121.81 161.021a24.045 24.045 0 0 1-14.42-6.481a30.85 30.85 0 0 1-10.077-16.365a3.889 3.889 0 0 1 .842-3.24a4.57 4.57 0 0 1 3.662-1.653h39.988a4.666 4.666 0 0 1 3.661 1.653a3.856 3.856 0 0 1 .81 3.24A30.85 30.85 0 0 1 136.2 154.54c-3.93 3.717-9 6-14.388 6.481m-19.993-23.98c-.519 0-.648.227-.68.292a26.864 26.864 0 0 0 8.846 14.16a20.188 20.188 0 0 0 11.828 5.672a20.35 20.35 0 0 0 11.828-5.606a26.896 26.896 0 0 0 8.814-14.161a.68.68 0 0 0-.648-.292z" />
      <g transform="translate(53.792 88.4)">
        <ellipse cx="117.047" cy="40.183" fill="#FEBBD0" rx="18.957" ry="11.147" />
        <ellipse cx="18.957" cy="40.183" fill="#FEBBD0" rx="18.957" ry="11.147" />
        <path d="M27.868 35.71a17.855 17.855 0 1 0-17.822-17.854c0 9.848 7.974 17.837 17.822 17.855m80.268 0A17.855 17.855 0 1 0 90.41 17.857c-.018 9.818 7.908 17.801 17.726 17.855" />
        <path
          fill="#FFF"
          d="M22.36 18.99a6.708 6.708 0 1 0 .064-13.416a6.708 6.708 0 0 0-.065 13.416m80.267 0a6.708 6.708 0 1 0-.065 0z"
        />
      </g>
    </svg>
  );
});
