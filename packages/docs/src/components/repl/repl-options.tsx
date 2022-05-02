import type { MinifyMode } from '@builder.io/qwik/optimizer';
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
      <StoreOption label="Minify" storeProp="minify" options={MINIFY_OPTIONS} store={store} />
      <StoreOption label="Version" storeProp="version" options={['0.0.19-0']} store={store} />
    </div>
  );
};

const StoreOption = (props: StoreOptionProps) => {
  return (
    <label>
      <span>{props.label}</span>
      <Select
        options={props.options}
        selectedValue={props.store[props.storeProp]}
        onChange$={(ev?: any) => {
          const select: HTMLSelectElement = ev.target;
          (props as any).store[props.storeProp] = select.value as any;
        }}
      />
    </label>
  );
};

const Select = (props: SelectProps) => {
  return (
    <select onChangeQrl={props.onChangeQrl}>
      {props.options.map((value) => {
        return (
          <option value={value} selected={value === props.selectedValue}>
            {value}
          </option>
        );
      })}
    </select>
  );
};

const MINIFY_OPTIONS: MinifyMode[] = ['none', 'simplify', 'minify'];

const ENTRY_STRATEGY_OPTIONS: string[] = ['component', 'hook', 'manual', 'single', 'smart'];

interface SelectProps {
  options: string[];
  selectedValue: any;
  onChange$: () => void;
  onChangeQrl?: any;
}

interface StoreOptionProps {
  label: string;
  options: string[];
  store: ReplStore;
  storeProp: keyof ReplStore;
}

interface ReplOptionsProps {
  store: ReplStore;
}
