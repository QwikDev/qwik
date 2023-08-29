import {
  component$,
  FunctionComponent,
  useVisibleTask$,
  useStore,
} from "@builder.io/qwik";
import { DocumentHead, useLocation } from "@builder.io/qwik-city";
import { Host, odd, pride, Range, Square } from "./flower.css";

type StoredInputProps<
  T,
  Cmp extends FunctionComponent,
  Name extends string = "value",
> = Parameters<Cmp>[0] & {
  store: { [value in Name]?: T };
  name?: Name;
};

export const RangeInput = <Name extends string = "value">({
  store,
  name = "value" as Name,
  ...props
}: StoredInputProps<number, typeof Range, Name>) => (
  <Range
    {...props}
    type="range"
    value={store[name]}
    onInput$={(ev) => {
      store[name] = (ev.target as HTMLInputElement).valueAsNumber;
    }}
  />
);

export default component$(() => {
  const loc = useLocation();

  const state = useStore({
    count: 0,
    number: 20,
  });

  useVisibleTask$(({ cleanup }) => {
    const timeout = setTimeout(() => (state.count = 1), 500);
    cleanup(() => clearTimeout(timeout));

    const internal = setInterval(() => state.count++, 7000);
    cleanup(() => clearInterval(internal));
  });

  return (
    <>
      <p>This is styled with qwik-styled-ve.</p>

      <RangeInput store={state} name="number" max={50} />
      <Host
        style={{
          "--state": `${state.count * 0.1}`,
        }}
        class={loc.url.searchParams.get("pride") && pride}
      >
        {Array.from({ length: state.number }, (_, i) => (
          <Square
            key={i}
            class={{ [odd]: i % 2 === 0 }}
            style={{ "--index": `${i + 1}` }}
          />
        )).reverse()}
      </Host>
    </>
  );
});

export const head: DocumentHead = {
  title: "Qwik Flower",
};
