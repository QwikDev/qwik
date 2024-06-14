import {
  $,
  useSignal,
  component$,
  type QRL,
  useStylesScoped$,
} from '@builder.io/qwik';

export const useDebouncer = (fn: QRL<(args: any) => void>, delay: number) => {
  const timeoutId = useSignal<number>();

  return $((args: any) => {
    clearTimeout(timeoutId.value);
    timeoutId.value = Number(setTimeout(() => fn(args), delay));
  });
};

export default component$(() => {
  useStylesScoped$(`
    input {
      margin: 0px;
      padding: 8px;
      font-size: 20px;
    }

    label {
      font-weight: bold;
      font-size: 20px;
      color: #1dacf2;
    }

    span {
      color: #888;
    }
  `);

  const debouncedValue = useSignal('');

  const debounce = useDebouncer(
    $((value: string) => {
      debouncedValue.value = value;
    }),
    1000
  );

  return (
    <>
      <input
        placeholder="Type something"
        onInput$={(_, target) => {
          debounce(target.value);
        }}
      />
      <br />
      <br />
      <label>Debounced Value</label>
      {debouncedValue.value ? (
        debouncedValue.value
      ) : (
        <span>Waiting for input to debounce.</span>
      )}
    </>
  );
});
