import { component$, Resource } from '@builder.io/qwik';
import { EndpointHandler, useEndpoint } from '@builder.io/qwik-city';

export default component$(() => {
  const resource = useEndpoint<EndpointData>();

  return (
    <Resource
      resource={resource}
      onResolved={(builderContent) => {
        return <main class="builder" dangerouslySetInnerHTML={builderContent.html} />;
      }}
      onRejected={(r) => {
        return <div>Unable to load content </div>;
      }}
    />
  );
});

export const onRequest: EndpointHandler<EndpointData> = async ({ url }) => {
  const qwikUrl = new URL('https://cdn.builder.io/api/v1/qwik/content-page');
  qwikUrl.searchParams.set('apiKey', 'fe30f73e01ef40558cd69a9493eba2a2');
  qwikUrl.searchParams.set('userAttributes.urlPath', url.pathname);

  const response = await fetch(qwikUrl);
  if (response.ok) {
    return { html: 'builder content' };
    // TODO!!!!! return await response.json();
  }
  throw new Error('Unable to load content');
};

type EndpointData = BuilderContent;

interface BuilderContent {
  html: string;
}
