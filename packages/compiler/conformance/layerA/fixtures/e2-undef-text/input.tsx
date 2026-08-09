// E2: undefined renders as nothing in text position, unlike null or the string
export function App() {
  const missing = undefined;
  return (
    <main>
      <span id="undef">{missing}</span>
      <span id="after">tail</span>
    </main>
  );
}
