import { createContextId, useContext, useContextProvider } from '@qwik.dev/core';

const ThemeContext = createContextId<{ color: string }>('theme');

export function App() {
  function Label() {
    const theme = useContext(ThemeContext);
    return <b>{theme.color}</b>;
  }
  function Section({ color }: { color: string }) {
    useContextProvider(ThemeContext, { color });
    return (
      <section>
        <Label />
      </section>
    );
  }
  return <Section color="red" />;
}
