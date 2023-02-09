import { component$, useClientEffect$, useSignal, useTask$ } from '@builder.io/qwik';
import { loader$ } from '@builder.io/qwik-city';
import { isBrowser } from '@builder.io/qwik/build';

export const cmp1 = loader$(() => {
  return {
    message: 'loader-cmp1',
  };
});

export const cmp2 = loader$(() => {
  return {
    message: 'loader-cmp2',
  };
});

export const cmp3 = loader$(() => {
  return {
    message: 'loader-cmp3',
  };
});

export const cmp4 = loader$(() => {
  return {
    message: 'loader-cmp4',
  };
});

export const cmp5 = loader$(() => {
  return {
    message: 'loader-cmp5',
  };
});

export const Cmp = component$(() => {
  const date = cmp1.use();
  const ref = useSignal<HTMLElement>();
  useClientEffect$(() => {
    ref.value!.textContent = date.value.message;
  });
  return (
    <div>
      <p class="loader-data" ref={ref}>
        empty
      </p>
    </div>
  );
});

export const Cmp2 = component$(() => {
  const date = cmp2.use();
  const signal = useSignal(0);
  const ref = useSignal<HTMLElement>();
  useTask$(({ track }) => {
    track(() => signal.value);
    if (isBrowser) {
      ref.value!.textContent = date.value.message;
    }
  });
  return (
    <div>
      <button id="update-cmp2" onClick$={() => signal.value++}>
        Update
      </button>
      <p class="loader-data" ref={ref}>
        empty
      </p>
    </div>
  );
});

export const Cmp3 = component$(() => {
  const date = cmp3.use();
  const signal = useSignal(0);

  return (
    <div>
      <button id="update-cmp3" onClick$={() => signal.value++}>
        Update
      </button>
      {signal.value > 0 && <p class="loader-data">{date.value.message}</p>}
    </div>
  );
});

export const Cmp4 = component$(() => {
  const date = cmp4.use();

  return (
    <div>
      <p class="loader-data">{date.value.message}</p>
    </div>
  );
});

export default component$(() => {
  return (
    <>
      <Cmp />
      <Cmp2 />
      <Cmp3 />
      <Cmp4 />
    </>
  );
});
