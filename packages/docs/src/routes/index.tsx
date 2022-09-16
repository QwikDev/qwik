import { component$, Resource, useResource$ } from '@builder.io/qwik';
import { DocumentHead, RequestHandler, useEndpoint, useLocation } from '@builder.io/qwik-city';
import { getContent, RenderContent, getBuilderSearchParams } from '@builder.io/sdk-qwik';

export const BUILDER_PUBLIC_API_KEY = 'fe30f73e01ef40558cd69a9493eba2a2'; // ggignore
export const MODEL = 'content-page';

export default component$(() => {
  const location = useLocation();
  const isSDK = location.query.render === 'sdk';

  if (isSDK) {
    const builderContentRsrc = useResource$<any>(() => {
      return getContent({
        model: MODEL,
        apiKey: BUILDER_PUBLIC_API_KEY,
        options: getBuilderSearchParams(location.query),
        userAttributes: {
          urlPath: '/betda',
        },
      });
    });

    return (
      <Resource
        value={builderContentRsrc}
        onPending={() => <div>Loading...</div>}
        onResolved={(content) => (
          <RenderContent model={MODEL} content={content} apiKey={BUILDER_PUBLIC_API_KEY} />
        )}
      />
    );
  } else {
    const resource = useEndpoint<typeof onRequest>();

    return (
      <>
        <Resource
          value={resource}
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
      </>
    );
  }
});

export const onRequest: RequestHandler<BuilderContent> = async ({ url }) => {
  const qwikUrl = new URL('https://cdn.builder.io/api/v1/qwik/' + MODEL);
  qwikUrl.searchParams.set('apiKey', BUILDER_PUBLIC_API_KEY);
  qwikUrl.searchParams.set('userAttributes.urlPath', '/');

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
