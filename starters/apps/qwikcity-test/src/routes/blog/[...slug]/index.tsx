import { component$ } from '@builder.io/qwik';
import { DocumentHead, StaticGenerateHandler, loader$ } from '@builder.io/qwik-city';

export default component$(() => {
  const blog = loader.use();

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

export const loader = loader$(({ params, request }) => {
  return {
    title: `Blog: ${params.slug}`,
    content: `${params.slug}, ${request.url}`,
  };
});

export const head: DocumentHead = ({ getData }) => {
  const data = getData(loader);
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
