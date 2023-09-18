import { Slot, component$, useContext, useSignal, useTask$ } from '@builder.io/qwik';
import { Tab, TabList, TabPanel, Tabs } from '@qwik-ui/headless';
import { PnpmIcon } from './pnpm';
import { YarnIcon } from './yarn';
import { NpmIcon } from './npm';
import { BunIcon } from './bun';
import { GlobalStore } from '../../context';
import { isBrowser } from '@builder.io/qwik/build';


const packageManagersTabs = [
  {
    name: 'npm',
    icon: NpmIcon,
  },
  {
    name: 'yarn',
    icon: YarnIcon,
  },
  {
    name: 'pnpm',
    icon: PnpmIcon,
  },
  {
    name: 'bun',
    icon: BunIcon,
  },
];

export default component$(() => {
  const activePkgTab = useSignal<number>(0);
  const globalStore = useContext(GlobalStore);

  useTask$(({ track }) => {
    const trackedValue = track(() => activePkgTab.value);
    globalStore.pkgManagerIdx = trackedValue;
  })

  return (
    <Tabs selectedIndex={globalStore.pkgManagerIdx} onSelectedIndexChange$={(currIdx) => { activePkgTab.value = currIdx }}>
      <TabList class={`-mb-4 space-x-2 ${globalStore.theme === 'light' ? "text-black" : "text-white"} `}>
        {
          packageManagersTabs.map((el, idx) => {
            return (
              <Tab class={`px-4 py-2 rounded-md ${globalStore.pkgManagerIdx === idx ? 'bg-[#011f33] hover:bg-none font-bold text-white': globalStore.theme === 'light' ? 'hover:bg-[var(--qwik-light-blue)] text-black' : 'hover:bg-[var(--on-this-page-hover-bg-color)] text-white'}`}>
                <span class="inline-flex items-center gap-x-2">
                  <el.icon width={18} height={18} />
                  {el.name}
                </span>
              </Tab>
            )
          })
        }
      </TabList>

      <TabPanel >
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
