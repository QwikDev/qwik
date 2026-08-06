export function App() {
  return (
    <form aria-hidden={false} draggable={true} spellcheck={false}>
      <input disabled={true} readOnly={false} aria-label="Name field" data-step={3} />
      <textarea contentEditable="true" hidden={false}></textarea>
    </form>
  );
}
