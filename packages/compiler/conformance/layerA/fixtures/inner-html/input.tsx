export function App() {
  return (
    <article>
      <div dangerouslySetInnerHTML="<b>bold &amp; raw</b>" />
    </article>
  );
}
