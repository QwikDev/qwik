import { component$, Resource } from '@builder.io/qwik';
import {
  useEndpoint,
  DocumentHead,
  RequestHandler,
  StaticGenerateHandler,
} from '@builder.io/qwik-city';

export default component$(() => {
  const resource = useEndpoint<typeof onGet>();

  return (
    <div>
      <Resource
        value={resource}
        onResolved={(blog) => (
          <>
            <h1>{blog.title}</h1>
            <p>{blog.content}</p>
          </>
        )}
      />
    </div>
  );
});

export const onGet: RequestHandler<BlogData> = async ({ params, request }) => {
  return {
    title: `Blog: ${params.slug}`,
    content: `${params.slug}, ${request.url}`,
  };
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

export const head: DocumentHead<BlogData> = ({ data }) => {
  return { title: data?.title };
};

export interface BlogData {
  title: string;
  content: string;
}
