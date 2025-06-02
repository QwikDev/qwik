import { component$, useComputed$ } from '@builder.io/qwik';
import { useDocumentHead } from '@builder.io/qwik-city';
import { useLocation as exampleTest } from '@builder.io/qwik-city';
const loc = exampleTest();

export default component$(() => {
  const head = useDocumentHead();
  const authorId = useComputed$(() => {
    return head.meta; // <--- EESLint was not happy here, but now it is
  });
  return (
    <>
      {authorId.value}
      <p>pathname: {loc.url.pathname}</p>
      <p>skuId: {loc.params.skuId}</p>
    </>
  );
});
