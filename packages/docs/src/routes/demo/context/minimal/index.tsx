import { type Signal, component$, useSignal } from '@builder.io/qwik';
import {
  useContext,
  useContextProvider,
  createContextId,
} from '@builder.io/qwik';

export const ThemeContext = createContextId<Signal<string>>(
  'docs.theme-context'
);

export default component$(() => {
  const theme = useSignal('dark');
  useContextProvider(ThemeContext, theme);
  return (
    <>
      <button
        onClick$={() =>
          (theme.value = theme.value == 'dark' ? 'light' : 'dark')
        }
      >
        Flip
      </button>
      <Child />
    </>
  );
});

const Child = component$(() => {
  const theme = useContext(ThemeContext);
  return <div>Theme is {theme.value}</div>;
});
