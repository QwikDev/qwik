import type { ReplStore } from './types';

export const ReplOptions = ({ store }: ReplOptionsProps) => {
  const versions = filterVersions(store.versions, store.version);

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
        options={versions}
        store={store}
        isLoading={versions.length === 0}
      />
    </div>
  );
};

const filterVersions = (versions: string[], version: string | undefined) => {
  if (!versions) {
    if (version) {
      return [version];
    } else {
      return [];
    }
  }

  return versions.filter((v) => {
    if (v === version) {
      return true;
    }
    if (v.includes('-')) {
      return false;
    }
    const parts = v.split('.');
    if (parts.length !== 3) {
      return false;
    }
    if (isNaN(parts[2] as any)) {
      return false;
    }
    if (parts[0] === '0' && parts[1] === '0') {
      if (parseInt(parts[2], 10) < 20) {
        return false;
      }
    }
    return true;
  });
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
