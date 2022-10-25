import { component$, useStore, PropFunction } from '@builder.io/qwik';

export const Events = component$(() => {
  const store = useStore({
    countTransparent: 0,
    countWrapped: 0,
    countAnchor: 0,
  });

  return (
    <div>
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
        <div
          onClick$={() => {
            throw new Error('event was not stopped');
          }}
        >
          <a
            href="/"
            preventdefault:click
            id="prevent-default-2"
            onClick$={(ev) => {
              ev.stopPropagation();
              store.countAnchor++;
            }}
          >
            Should count
          </a>
        </div>
      </p>

      <p id="count-transparent">countTransparent: {store.countTransparent}</p>
      <p id="count-wrapped">countWrapped: {store.countWrapped}</p>
      <p id="count-anchor">countAnchor: {store.countAnchor}</p>
    </div>
  );
});

interface ButtonProps {
  onTransparentClick$?: PropFunction<(ev: Event) => any>;
  onWrappedClick$?: PropFunction<(nu: number) => void>;
}

export const Buttons = component$((props: ButtonProps) => {
  const store = useStore({ count: 0 });
  return (
    <div>
      <span>some</span>
      <button id="btn-transparent" onClick$={props.onTransparentClick$ as any}>
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
    </div>
  );
});
