import {
  type DocumentHead,
  type StaticGenerateHandler,
  routeLoader$,
} from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  const blog = useLoader();

  return (
    <div>
      <h1>{blog.value.title}</h1>
      <p>{blog.value.content}</p>
    </div>
  );
});

export interface BlogData {
  title: string;
  content: string;
}

export const useLoader = routeLoader$(({ params, request }) => {
  return {
    title: `Blog: ${params.slug}`,
    content: `${params.slug}, ${request.url}`,
  };
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useLoader);
  return { title: data?.title };
};

export const onStaticGenerate: StaticGenerateHandler = async () => {
  return {
    params: [
      {
        slug: `what-is-resumability`,
      },
    ],
  };
};
