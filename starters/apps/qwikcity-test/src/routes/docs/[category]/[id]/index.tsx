import { useLocation, type DocumentHead } from "@qwikdev/city";
import { component$ } from "@qwikdev/core";

export default component$(() => {
  const { url, params } = useLocation();

  return (
    <div>
      <h1>
        Docs: {params.category} {params.id}
      </h1>
      <p>pathname: {url.pathname}</p>
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
