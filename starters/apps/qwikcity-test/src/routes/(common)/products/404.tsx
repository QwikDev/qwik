import { component$ } from "@builder.io/qwik";
import { useLocation, type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  const { params } = useLocation();

  return (
    <div>
      <h1>Product {params.id} not found</h1>
    </div>
  );
});

export const head: DocumentHead = ({ params }) => {
  return {
    title: `Product ${params.id} Not Found`,
  };
};
