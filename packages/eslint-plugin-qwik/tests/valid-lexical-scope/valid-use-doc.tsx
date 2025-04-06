import { component$, useComputed$ } from '@qwik.dev/core';
import { useDocumentHead } from '@qwik.dev/router';
import { useLocation as exampleTest } from '@qwik.dev/router';
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
