import type { ReplStore } from './types';

export const ReplOptions = ({ store }: ReplOptionsProps) => {
  return (
    <div class="output-detail detail-options">
      <StoreOption
        label="Entry Strategy"
        storeProp="entryStrategy"
        options={ENTRY_STRATEGY_OPTIONS}
        store={store}
      />

      <StoreOption label="Mode" storeProp="buildMode" options={MODE_OPTIONS} store={store} />

      <StoreOption
        label="Version"
        storeProp="version"
        options={store.versions}
        store={store}
        isLoading={!store.versions || store.versions.length === 0}
      />
    </div>
  );
};

const StoreOption = (props: StoreOptionProps) => {
  return (
    <label>
      <span>{props.label}</span>
      <select
        onChange$={(ev?: any) => {
          const select: HTMLSelectElement = ev.target;
          (props as any).store[props.storeProp] = select.value as any;
        }}
        disabled={!!props.isLoading}
      >
        {props.options.map((value) => (
          <option
            value={value}
            selected={value === props.store[props.storeProp] ? true : undefined}
            key={value}
          >
            {value}
          </option>
        ))}
        {props.isLoading ? <option>Loading...</option> : null}
      </select>
    </label>
  );
};

const MODE_OPTIONS = ['development', 'production'];

const ENTRY_STRATEGY_OPTIONS = ['component', 'hook', 'single', 'smart'];

interface StoreOptionProps {
  label: string;
  options: string[];
  store: ReplStore;
  storeProp: keyof ReplStore;
  isLoading?: boolean;
}

interface ReplOptionsProps {
  store: ReplStore;
}
