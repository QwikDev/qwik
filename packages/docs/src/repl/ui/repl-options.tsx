import type { ReplAppInput } from '../types';

export const ReplOptions = ({ input, versions, qwikVersion }: ReplOptionsProps) => {
  return (
    <div class="output-detail detail-options">
      <StoreOption
        label="Version"
        inputProp="version"
        options={versions}
        labels={{ bundled: qwikVersion }}
        input={input}
        isLoading={versions.length === 0}
      />

      <StoreOption label="Mode" inputProp="buildMode" options={BUILD_MODE_OPTIONS} input={input} />

      <StoreOption
        label="Entry Strategy"
        inputProp="entryStrategy"
        options={ENTRY_STRATEGY_OPTIONS}
        input={input}
      />

      <StoreBoolean label="Debug" inputProp="debug" input={input} />
    </div>
  );
};

const StoreBoolean = (props: StoreBooleanProps) => {
  return (
    <label>
      <span>{props.label}</span>
      <input
        type="checkbox"
        checked={!!props.input[props.inputProp]}
        onChange$={(ev?: any) => {
          const input: HTMLInputElement = ev.target;
          (props.input as any)[props.inputProp] = input.checked;
        }}
      />
    </label>
  );
};

const StoreOption = (props: StoreOptionProps) => {
  return (
    <label>
      <span>{props.label}</span>
      <select
        onChange$={(ev?: any) => {
          const select: HTMLSelectElement = ev.target;
          (props.input as any)[props.inputProp] = select.value as any;
        }}
        disabled={!!props.isLoading}
      >
        {props.options.map((value) => (
          <option
            value={value}
            selected={value === props.input[props.inputProp] ? true : undefined}
            key={value}
          >
            {props.labels?.[value] || value}
          </option>
        ))}
        {props.isLoading ? <option>Loading...</option> : null}
      </select>
    </label>
  );
};

export const BUILD_MODE_OPTIONS = ['development', 'production'];

// We don't support `inline` and `hoist` for client bundles
export const ENTRY_STRATEGY_OPTIONS = ['component', 'segment', 'single', 'smart'];

interface StoreOptionProps {
  label: string;
  options: string[];
  labels?: { [value: string]: string };
  input: ReplAppInput;
  inputProp: keyof ReplAppInput;
  isLoading?: boolean;
}

interface StoreBooleanProps {
  label: string;
  input: ReplAppInput;
  inputProp: keyof ReplAppInput;
}

interface ReplOptionsProps {
  input: ReplAppInput;
  versions: string[];
  qwikVersion: string;
}
