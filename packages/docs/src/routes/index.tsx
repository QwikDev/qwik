import { component$, Resource, useStyles$ } from '@builder.io/qwik';
import { EndpointHandler, useEndpoint } from '@builder.io/qwik-city';
import styles from './builder.css?inline';

export default component$(() => {
  useStyles$(styles);

  const resource = useEndpoint<EndpointData>();

  return (
    <Resource
      resource={resource}
      onResolved={(builderContent) => {
        return <main class="builder" dangerouslySetInnerHTML={builderContent.html} />;
      }}
      onRejected={() => {
        return <div>Unable to load content</div>;
      }}
    />
  );
});

export const onRequest: EndpointHandler<EndpointData> = async ({ request }) => {
  const qwikUrl = new URL('https://cdn.builder.io/api/v1/qwik/content-page');
  qwikUrl.searchParams.set('apiKey', 'fe30f73e01ef40558cd69a9493eba2a2');
  qwikUrl.searchParams.set('userAttributes.urlPath', request.url);

  const response = await fetch(String(qwikUrl));
  if (response.ok) {
    const { html } = await response.json();
    return html;
  }
  throw new Error('Unable to load content');
};

type EndpointData = BuilderContent;

interface BuilderContent {
  html: string;
}
