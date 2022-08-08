import { component$, Host, Resource } from '@builder.io/qwik';
import { DocumentHead, RequestHandler, useEndpoint } from '@builder.io/qwik-city';

export default component$(() => {
  const resource = useEndpoint<typeof onRequest>();

  return (
    <Host>
      <Resource
        resource={resource}
        onResolved={(builderContent) => {
          return <main class="builder" dangerouslySetInnerHTML={builderContent.html} />;
        }}
        onRejected={(r) => {
          return (
            <div>
              Unable to load content <span hidden>{r}</span>
            </div>
          );
        }}
      />
    </Host>
  );
});

export const onRequest: RequestHandler<BuilderContent> = async ({ url }) => {
  const qwikUrl = new URL('https://cdn.builder.io/api/v1/qwik/content-page');
  qwikUrl.searchParams.set('apiKey', 'fe30f73e01ef40558cd69a9493eba2a2');
  qwikUrl.searchParams.set('userAttributes.urlPath', url.pathname);

  const response = await fetch(qwikUrl.href);
  if (response.ok) {
    const content: BuilderContent = JSON.parse(await response.text());
    return content;
  }
  throw new Error('Unable to load Builder content');
};

interface BuilderContent {
  html: string;
}

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
