import { component$, useStore, Host, PropFunction } from '@builder.io/qwik';

export const Events = component$(() => {
  const store = useStore({
    countTransparent: 0,
    countWrapped: 0,
    countAnchor: 0,
  });

  return (
    <Host>
      <Buttons
        onTransparentClick$={async () => {
          store.countTransparent++;
        }}
        onWrappedClick$={async () => {
          store.countWrapped++;
        }}
      ></Buttons>
      <p>
        <a href="/" preventdefault:click id="prevent-default-1">
          Should prevent default
        </a>
      </p>
      <p>
        <a
          href="/"
          preventdefault:click
          id="prevent-default-2"
          onClick$={() => store.countAnchor++}
        >
          Should count
        </a>
      </p>

      <p id="count-transparent">countTransparent: {store.countTransparent}</p>
      <p id="count-wrapped">countWrapped: {store.countWrapped}</p>
      <p id="count-anchor">countAnchor: {store.countAnchor}</p>
    </Host>
  );
});

interface ButtonProps {
  onTransparentClick$?: PropFunction<(ev: Event) => any>;
  onWrappedClick$?: PropFunction<(nu: number) => void>;
}

export const Buttons = component$((props: ButtonProps) => {
  const store = useStore({ count: 0 });
  return (
    <Host>
      <span>some</span>
      <button id="btn-transparent" onClick$={props.onTransparentClick$}>
        Transparent
      </button>
      <button
        id="btn-wrapped"
        onClick$={async () => {
          store.count++;
          await props.onWrappedClick$?.(store.count);
        }}
      >
        Wrapped {store.count}
      </button>
    </Host>
  );
});
