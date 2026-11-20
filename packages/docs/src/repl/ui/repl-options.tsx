import { lucide } from '@qds.dev/ui';
import type { ReplAppInput } from '../types';
import { BUILD_MODE_OPTIONS, ENTRY_STRATEGY_OPTIONS } from './repl-option-values';

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

      <StoreChoice
        label="Mode"
        inputProp="buildMode"
        options={BUILD_MODE_OPTIONS}
        labels={{ development: 'Development', production: 'Production' }}
        input={input}
      />

      <StoreChoice
        label="Entry Strategy"
        inputProp="entryStrategy"
        options={ENTRY_STRATEGY_OPTIONS}
        input={input}
      />

      <StoreBoolean label="Out-of-order streaming" inputProp="outOfOrderStreaming" input={input} />

      <StoreBoolean label="Rust optimizer" inputProp="rustOptimizer" input={input} />

      <StoreBoolean label="Debug" inputProp="debug" input={input} />
    </div>
  );
};

const StoreBoolean = (props: StoreBooleanProps) => {
  return (
    <label class="repl-toggle-field">
      <span class="repl-select-label">{props.label}</span>
      <input
        type="checkbox"
        role="switch"
        class="repl-switch"
        checked={!!props.input[props.inputProp]}
        onChange$={(_, checkbox) => {
          props.input[props.inputProp] = checkbox.checked;
        }}
      />
    </label>
  );
};

/** Few options fit side by side, so they need one click instead of a dropdown. */
const StoreChoice = <K extends OptionKey>(props: StoreOptionProps<K>) => {
  return (
    <div class="repl-select-field">
      <span class="repl-select-label">{props.label}</span>
      <div class="repl-choice" role="radiogroup" aria-label={props.label}>
        {props.options.map((value) => (
          <label key={value} class="repl-choice-option">
            <input
              type="radio"
              name={props.inputProp}
              checked={value === props.input[props.inputProp]}
              onChange$={() => {
                props.input[props.inputProp] = value;
              }}
            />
            {props.labels?.[value] || value}
          </label>
        ))}
      </div>
    </div>
  );
};

const StoreOption = <K extends OptionKey>(props: StoreOptionProps<K>) => {
  return (
    <label class="repl-select-field">
      <span class="repl-select-label">{props.label}</span>
      <div class="repl-select-wrapper">
        <select
          class="repl-select"
          onChange$={(_, select) => {
            const value = props.options.find((option) => option === select.value);
            if (value !== undefined) {
              props.input[props.inputProp] = value;
            }
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
        <span class="repl-select-icon">
          <lucide.chevrondown class="size-4" />
        </span>
      </div>
    </label>
  );
};

/** Keys of `ReplAppInput` whose value has type `T`. */
type InputKeysOf<T> = {
  [K in keyof ReplAppInput]-?: NonNullable<ReplAppInput[K]> extends T ? K : never;
}[keyof ReplAppInput];

type OptionKey = InputKeysOf<string>;

interface StoreOptionProps<K extends OptionKey> {
  label: string;
  options: ReplAppInput[K][];
  labels?: Partial<Record<string, string>>;
  input: ReplAppInput;
  inputProp: K;
  isLoading?: boolean;
}

interface StoreBooleanProps {
  label: string;
  input: ReplAppInput;
  inputProp: InputKeysOf<boolean>;
}

interface ReplOptionsProps {
  input: ReplAppInput;
  versions: string[];
  qwikVersion: string;
}
