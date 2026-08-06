import { createContextId, useContext, useContextProvider, useSignal } from '@qwik.dev/core';

const ThemeContext = createContextId<{ value: string }>('theme');

export function Panel() {
  const theme = useContext(ThemeContext);
  return <p>{theme.value}</p>;
}

export function App() {
  const theme = useSignal('dark');
  useContextProvider(ThemeContext, theme);
  return (
    <section>
      <Panel />
    </section>
  );
}
