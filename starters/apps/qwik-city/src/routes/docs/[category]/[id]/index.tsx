import { component$ } from '@builder.io/qwik';
import { useLocation, DocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  const { pathname, params } = useLocation();

  return (
    <div>
      <h1>
        Docs: {params.category} {params.id}
      </h1>
      <p>pathname: {pathname}</p>
      <p>category: {params.category}</p>
      <p>id: {params.id}</p>
    </div>
  );
});

export const head: DocumentHead = ({ params }) => {
  return {
    title: `${params.category} ${params.id}`,
  };
};
