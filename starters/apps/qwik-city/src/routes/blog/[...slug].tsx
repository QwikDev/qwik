import { component$, Host, Resource } from '@builder.io/qwik';
import { useEndpoint, DocumentHead, EndpointHandler } from '@builder.io/qwik-city';

export default component$(() => {
  const resource = useEndpoint<typeof onGet>();

  return (
    <Host>
      <Resource
        resource={resource}
        onResolved={(blog) => (
          <>
            <h1>{blog.blogTitle}</h1>
            <p>{blog.blogContent}</p>
          </>
        )}
      />
    </Host>
  );
});

export const onGet: EndpointHandler<EndpointData> = async ({ params, request }) => {
  return {
    blogTitle: `Blog: ${params.slug}`,
    blogContent: `${params.slug}, ${request.url}`,
  };
};

export const head: DocumentHead<EndpointData> = ({ data }) => {
  return { title: data?.blogTitle };
};

export interface EndpointData {
  blogTitle: string;
  blogContent: string;
}
