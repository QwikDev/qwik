import { Slot, component$, useContext, useSignal } from '@builder.io/qwik';
import { Tabs } from '@qwik-ui/headless';
import { GlobalStore } from '~/context';

const pkgManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const;
type PkgManagers = (typeof pkgManagers)[number];

export interface IconProps {
  width?: number;
  height?: number;
}

export default component$(() => {
  const globalStore = useContext(GlobalStore);
  const selectedPkgManagersSig = useSignal<PkgManagers>('pnpm');

  return (
    <Tabs.Root
      selectedTabId={selectedPkgManagersSig.value}
      onSelectedTabIdChange$={(pkgManager) => {
        selectedPkgManagersSig.value = pkgManager as PkgManagers;
      }}
    >
      <Tabs.List>
        <Tabs.Tab
          tabId="pnpm"
          class={`px-4 py-2 rounded-md ${
            selectedPkgManagersSig.value === 'pnpm'
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
        </Tabs.Tab>
        <Tabs.Tab
          tabId="npm"
          class={`px-4 py-2 rounded-md ${
            selectedPkgManagersSig.value === 'npm'
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
        </Tabs.Tab>
        <Tabs.Tab
          tabId="yarn"
          class={`px-4 py-2 rounded-md ${
            selectedPkgManagersSig.value === 'yarn'
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
        </Tabs.Tab>
        <Tabs.Tab
          tabId="bun"
          class={`px-4 py-2 rounded-md ${
            selectedPkgManagersSig.value === 'bun'
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
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel>
        <Slot name="pnpm" />
      </Tabs.Panel>
      <Tabs.Panel>
        <Slot name="npm" />
      </Tabs.Panel>
      <Tabs.Panel>
        <Slot name="yarn" />
      </Tabs.Panel>
      <Tabs.Panel>
        <Slot name="bun" />
      </Tabs.Panel>
    </Tabs.Root>
  );
});

const PnpmIcon = (() => 
  <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    preserveAspectRatio="xMidYMid meet"
    viewBox="76.58987244897958 44 164.00775510204068 164"
    width={18}
    height={18}
  >
    <defs>
      <path d="M237.6 95L187.6 95L187.6 45L237.6 45L237.6 95Z" id="arNRoK435"></path>
      <path d="M182.59 95L132.59 95L132.59 45L182.59 45L182.59 95Z" id="a3H2WU7Px"></path>
      <path d="M127.59 95L77.59 95L77.59 45L127.59 45L127.59 95Z" id="b1DInM56vl"></path>
      <path d="M237.6 150L187.6 150L187.6 100L237.6 100L237.6 150Z" id="a7LFlgQIwu"></path>
      <path d="M182.59 150L132.59 150L132.59 100L182.59 100L182.59 150Z" id="amwLiZcuo"></path>
      <path d="M182.59 205L132.59 205L132.59 155L182.59 155L182.59 205Z" id="f3Peu5RWan"></path>
      <path d="M237.6 205L187.6 205L187.6 155L237.6 155L237.6 205Z" id="a6DXBfqPa"></path>
      <path d="M127.59 205L77.59 205L77.59 155L127.59 155L127.59 205Z" id="c1GWSTH1z7"></path>
    </defs>
    <g>
      <g>
        <use xlink:href="#arNRoK435" opacity="1" fill="#f9ad00" fill-opacity="1"></use>
      </g>
      <g>
        <use xlink:href="#a3H2WU7Px" opacity="1" fill="#f9ad00" fill-opacity="1"></use>
      </g>
      <g>
        <use xlink:href="#b1DInM56vl" opacity="1" fill="#f9ad00" fill-opacity="1"></use>
      </g>
      <g>
        <use xlink:href="#a7LFlgQIwu" opacity="1" fill="#f9ad00" fill-opacity="1"></use>
      </g>
      <g>
        <use xlink:href="#amwLiZcuo" opacity="1" fill="#4e4e4e" fill-opacity="1"></use>
      </g>
      <g>
        <use xlink:href="#f3Peu5RWan" opacity="1" fill="#4e4e4e" fill-opacity="1"></use>
      </g>
      <g>
        <use xlink:href="#a6DXBfqPa" opacity="1" fill="#4e4e4e" fill-opacity="1"></use>
      </g>
      <g>
        <use xlink:href="#c1GWSTH1z7" opacity="1" fill="#4e4e4e" fill-opacity="1"></use>
      </g>
    </g>
  </svg>
)

const NpmIcon = (() => 
  <svg
    width={18}
    height={18}
    viewBox="0 0 630 630"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
  >
    <rect width="630" height="630" fill="url(#pattern0)" />
    <defs>
      <pattern id="pattern0" patternContentUnits="objectBoundingBox" width="1" height="1">
        <use xlink:href="#image0_13_2" transform="scale(0.0015873)" />
      </pattern>
      <image
        id="image0_13_2"
        width="630"
        height="630"
        xlink:href="data:image/png;base64,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iBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIO76wXq3Ger2eB/M1j12ub/7668Gen2d2Z71d9//6Plxf55qf6c1evdmz4Z+mo/nx2I6XZZpsxmfgwq1b49KdO2Pa0/x0fHr7dvz+5MlYvXu3neG0nLt8efx49+44d/HidobTsom6N4eH4/3x8XaGnVlwowg7/sWqUzTvKOyIPWR3PNdnRNidgLADAJZowY3ifRsAQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEdPRGOvteFn25uZcL/PWAIDv2DSNsVptPyzLcsMOAID/xatYAIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMAiBB2AAARwg4AIELYAQBECDsAgAhhBwAQIewAACKEHQBAhLADAIgQdgAAEcIOACBC2AEARAg7AIAIYQcAECHsAAAihB0AQISwAwCIEHYAABHCDgAgQtgBAEQIOwCACGEHABAh7AAAIoQdAECEsAMASBjjT53R4qbnekMRAAAAAElFTkSuQmCC"
      />
    </defs>
  </svg>
);

const YarnIcon = (() => 
  <svg
    viewBox="0 0 512 512"
    xmlns="http://www.w3.org/2000/svg"
    fill-rule="evenodd"
    clip-rule="evenodd"
    stroke-linejoin="round"
    stroke-miterlimit="2"
    width={18}
    height={18}
  >
    <path
      d="M256 0c141.344 0 256 114.656 256 256S397.344 512 256 512 0 397.344 0 256 114.656 0 256 0z"
      fill="#2c8ebb"
      fill-rule="nonzero"
    />
    <path
      d="M430.16 333.59c-1.78-14.035-13.641-23.721-28.863-23.524-22.733.297-41.81 12.06-54.461 19.868-4.943 3.064-9.193 5.337-12.85 7.017.79-11.465.099-26.49-5.832-42.996-7.215-19.768-16.901-31.926-23.82-38.943 8.006-11.664 18.977-28.665 24.117-54.956 4.448-22.437 3.064-57.329-7.117-76.9-2.075-3.953-5.535-6.82-9.884-8.005-1.779-.495-5.14-1.483-11.762.395-9.983-20.658-13.442-22.832-16.111-24.612-5.535-3.558-12.059-4.349-18.187-2.075-8.204 2.965-15.222 10.872-21.844 24.908-.988 2.075-1.878 4.052-2.669 6.03-12.553.889-32.321 5.435-49.025 23.523-2.076 2.274-6.128 3.954-10.379 5.536h.1c-8.699 3.064-12.653 10.18-17.496 23.03-6.721 17.989.198 35.682 7.018 47.147-9.291 8.303-21.646 21.548-28.17 37.066-8.105 19.175-8.994 37.955-8.698 48.136-6.919 7.314-17.594 21.053-18.78 36.472-1.581 21.548 6.227 36.176 9.687 41.514.988 1.581 2.075 2.866 3.261 4.151-.395 2.669-.494 5.535.1 8.5 1.284 6.92 5.633 12.553 12.256 16.112 13.047 6.919 31.234 9.884 45.27 2.866 5.04 5.338 14.232 10.477 30.937 10.477h.988c4.25 0 58.218-2.866 73.934-6.72 7.017-1.681 11.86-4.646 15.023-7.315 10.082-3.163 37.956-12.652 64.248-29.653 18.582-12.058 25.007-14.628 38.844-17.989 13.443-3.262 21.844-15.518 20.164-29.06zm-23.525 14.53c-15.815 3.756-23.821 7.216-43.392 19.966-30.542 19.769-63.95 28.961-63.95 28.961s-2.768 4.151-10.774 6.03c-13.838 3.36-65.927 6.226-70.672 6.325-12.75.1-20.559-3.261-22.733-8.5-6.623-15.815 9.488-22.734 9.488-22.734s-3.558-2.174-5.634-4.151c-1.878-1.878-3.854-5.634-4.448-4.25-2.47 6.03-3.756 20.757-10.378 27.379-9.093 9.192-26.292 6.128-36.473.79-11.169-5.93.791-19.866.791-19.866s-6.03 3.558-10.872-3.756c-4.35-6.722-8.402-18.187-7.315-32.322 1.186-16.11 19.176-31.728 19.176-31.728s-3.163-23.82 7.215-48.235c9.39-22.239 34.694-40.13 34.694-40.13s-21.251-23.524-13.344-44.676c5.14-13.838 7.215-13.739 8.896-14.332 5.93-2.273 11.663-4.744 15.913-9.39 21.251-22.931 48.334-18.582 48.334-18.582s12.85-39.043 24.71-31.432c3.657 2.372 16.803 31.63 16.803 31.63s14.036-8.204 15.617-5.14c8.5 16.506 9.49 48.037 5.733 67.212-6.326 31.63-22.14 48.63-28.466 59.305-1.483 2.471 17 10.28 28.664 42.601 10.774 29.554 1.186 54.363 2.866 57.13.297.495.396.692.396.692s12.355.989 37.164-14.332c13.245-8.204 28.96-17.396 46.851-17.593 17.297-.297 18.187 19.966 5.14 23.128z"
      fill="#fff"
      fill-rule="nonzero"
    />
  </svg>
);

const BunIcon = (() => 
  <svg
    id="Bun"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 80 70"
    height={18}
    width={18}
  >
    <path
      id="Shadow"
      d="M71.09,20.74c-.16-.17-.33-.34-.5-.5s-.33-.34-.5-.5-.33-.34-.5-.5-.33-.34-.5-.5-.33-.34-.5-.5-.33-.34-.5-.5-.33-.34-.5-.5A26.46,26.46,0,0,1,75.5,35.7c0,16.57-16.82,30.05-37.5,30.05-11.58,0-21.94-4.23-28.83-10.86l.5.5.5.5.5.5.5.5.5.5.5.5.5.5C19.55,65.3,30.14,69.75,42,69.75c20.68,0,37.5-13.48,37.5-30C79.5,32.69,76.46,26,71.09,20.74Z"
    />
    <g id="Body">
      <path
        id="Background"
        d="M73,35.7c0,15.21-15.67,27.54-35,27.54S3,50.91,3,35.7C3,26.27,9,17.94,18.22,13S33.18,3,38,3s8.94,4.13,19.78,10C67,17.94,73,26.27,73,35.7Z"
        style="fill:#fbf0df"
      />
      <path
        id="Bottom_Shadow"
        data-name="Bottom Shadow"
        d="M73,35.7a21.67,21.67,0,0,0-.8-5.78c-2.73,33.3-43.35,34.9-59.32,24.94A40,40,0,0,0,38,63.24C57.3,63.24,73,50.89,73,35.7Z"
        style="fill:#f6dece"
      />
      <path
        id="Light_Shine"
        data-name="Light Shine"
        d="M24.53,11.17C29,8.49,34.94,3.46,40.78,3.45A9.29,9.29,0,0,0,38,3c-2.42,0-5,1.25-8.25,3.13-1.13.66-2.3,1.39-3.54,2.15-2.33,1.44-5,3.07-8,4.7C8.69,18.13,3,26.62,3,35.7c0,.4,0,.8,0,1.19C9.06,15.48,20.07,13.85,24.53,11.17Z"
        style="fill:#fffefc"
      />
      <path
        id="Top"
        d="M35.12,5.53A16.41,16.41,0,0,1,29.49,18c-.28.25-.06.73.3.59,3.37-1.31,7.92-5.23,6-13.14C35.71,5,35.12,5.12,35.12,5.53Zm2.27,0A16.24,16.24,0,0,1,39,19c-.12.35.31.65.55.36C41.74,16.56,43.65,11,37.93,5,37.64,4.74,37.19,5.14,37.39,5.49Zm2.76-.17A16.42,16.42,0,0,1,47,17.12a.33.33,0,0,0,.65.11c.92-3.49.4-9.44-7.17-12.53C40.08,4.54,39.82,5.08,40.15,5.32ZM21.69,15.76a16.94,16.94,0,0,0,10.47-9c.18-.36.75-.22.66.18-1.73,8-7.52,9.67-11.12,9.45C21.32,16.4,21.33,15.87,21.69,15.76Z"
        style="fill:#ccbea7;fill-rule:evenodd"
      />
      <path
        id="Outline"
        d="M38,65.75C17.32,65.75.5,52.27.5,35.7c0-10,6.18-19.33,16.53-24.92,3-1.6,5.57-3.21,7.86-4.62,1.26-.78,2.45-1.51,3.6-2.19C32,1.89,35,.5,38,.5s5.62,1.2,8.9,3.14c1,.57,2,1.19,3.07,1.87,2.49,1.54,5.3,3.28,9,5.27C69.32,16.37,75.5,25.69,75.5,35.7,75.5,52.27,58.68,65.75,38,65.75ZM38,3c-2.42,0-5,1.25-8.25,3.13-1.13.66-2.3,1.39-3.54,2.15-2.33,1.44-5,3.07-8,4.7C8.69,18.13,3,26.62,3,35.7,3,50.89,18.7,63.25,38,63.25S73,50.89,73,35.7C73,26.62,67.31,18.13,57.78,13,54,11,51.05,9.12,48.66,7.64c-1.09-.67-2.09-1.29-3-1.84C42.63,4,40.42,3,38,3Z"
      />
    </g>
    <g id="Mouth">
      <g id="Background-2" data-name="Background">
        <path
          d="M45.05,43a8.93,8.93,0,0,1-2.92,4.71,6.81,6.81,0,0,1-4,1.88A6.84,6.84,0,0,1,34,47.71,8.93,8.93,0,0,1,31.12,43a.72.72,0,0,1,.8-.81H44.26A.72.72,0,0,1,45.05,43Z"
          style="fill:#b71422"
        />
      </g>
      <g id="Tongue">
        <path
          id="Background-3"
          data-name="Background"
          d="M34,47.79a6.91,6.91,0,0,0,4.12,1.9,6.91,6.91,0,0,0,4.11-1.9,10.63,10.63,0,0,0,1-1.07,6.83,6.83,0,0,0-4.9-2.31,6.15,6.15,0,0,0-5,2.78C33.56,47.4,33.76,47.6,34,47.79Z"
          style="fill:#ff6164"
        />
        <path
          id="Outline-2"
          data-name="Outline"
          d="M34.16,47a5.36,5.36,0,0,1,4.19-2.08,6,6,0,0,1,4,1.69c.23-.25.45-.51.66-.77a7,7,0,0,0-4.71-1.93,6.36,6.36,0,0,0-4.89,2.36A9.53,9.53,0,0,0,34.16,47Z"
        />
      </g>
      <path
        id="Outline-3"
        data-name="Outline"
        d="M38.09,50.19a7.42,7.42,0,0,1-4.45-2,9.52,9.52,0,0,1-3.11-5.05,1.2,1.2,0,0,1,.26-1,1.41,1.41,0,0,1,1.13-.51H44.26a1.44,1.44,0,0,1,1.13.51,1.19,1.19,0,0,1,.25,1h0a9.52,9.52,0,0,1-3.11,5.05A7.42,7.42,0,0,1,38.09,50.19Zm-6.17-7.4c-.16,0-.2.07-.21.09a8.29,8.29,0,0,0,2.73,4.37A6.23,6.23,0,0,0,38.09,49a6.28,6.28,0,0,0,3.65-1.73,8.3,8.3,0,0,0,2.72-4.37.21.21,0,0,0-.2-.09Z"
      />
    </g>
    <g id="Face">
      <ellipse
        id="Right_Blush"
        data-name="Right Blush"
        cx="53.22"
        cy="40.18"
        rx="5.85"
        ry="3.44"
        style="fill:#febbd0"
      />
      <ellipse
        id="Left_Bluch"
        data-name="Left Bluch"
        cx="22.95"
        cy="40.18"
        rx="5.85"
        ry="3.44"
        style="fill:#febbd0"
      />
      <path
        id="Eyes"
        d="M25.7,38.8a5.51,5.51,0,1,0-5.5-5.51A5.51,5.51,0,0,0,25.7,38.8Zm24.77,0A5.51,5.51,0,1,0,45,33.29,5.5,5.5,0,0,0,50.47,38.8Z"
        style="fill-rule:evenodd"
      />
      <path
        id="Iris"
        d="M24,33.64a2.07,2.07,0,1,0-2.06-2.07A2.07,2.07,0,0,0,24,33.64Zm24.77,0a2.07,2.07,0,1,0-2.06-2.07A2.07,2.07,0,0,0,48.75,33.64Z"
        style="fill:#fff;fill-rule:evenodd"
      />
    </g>
  </svg>
));
