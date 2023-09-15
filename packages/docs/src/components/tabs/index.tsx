import { Slot, component$, useContext, useSignal, type Signal } from '@builder.io/qwik';
import { GlobalStore } from '../../context';

interface Tabs {
  tabs: {
    name: string;
    key: string;
  }[];
  activeTab: Signal<string>;
}

export default component$<Tabs>((props) => {
  const theme = useContext(GlobalStore);

  const defaultActiveKey = props.tabs.at(0)?.key as string;

  const currActive = useSignal<string>(defaultActiveKey);

  return (
    <section>
      <div class="border-gray-200 dark:border-gray-700">
        <ul
          class="flex flex-wrap text-sm font-medium text-center space-x-2 ml-0"
          style={{ margin: '0px' }}
        >
          {props.tabs.map((el, idx) => {
            return (
              <li
                class={`list-none
                    ${
                      currActive.value === el.key
                        ? 'bg-[#011f33] hover:bg-none font-bold text-white'
                        : theme.theme === 'light'
                        ? 'hover:bg-[var(--qwik-light-blue)] text-black'
                        : 'hover:bg-[var(--qwik-dark-blue)] text-white'
                    }
                    rounded-md `}
                key={`tabs-${el.name}-${idx}`}
              >
                <button
                  class={`px-4 py-2`}
                  type="button"
                  onClick$={() => (currActive.value = el.key)}
                >
                  <Slot name={`tab-${el.key}`} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div class="-mt-4 rounded-none">
        {props.tabs.map((el, idx) => {
          return (
            <div
              class={`${el.key === currActive.value ? null : 'hidden'}`}
              key={`panel-${el.name}-${idx}`}
            >
              <Slot name={`panel-${el.key}`} />
            </div>
          );
        })}
      </div>
    </section>
  );
});
