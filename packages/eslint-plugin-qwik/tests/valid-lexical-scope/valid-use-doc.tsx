import { component$, useComputed$ } from '@builder.io/qwik';
import { useDocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  const head = useDocumentHead();
  const authorId = useComputed$(() => {
    return head.meta; // <--- ESLint not happy
  });
  return <>{authorId.value}</>;
});
