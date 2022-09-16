import { component$, Resource } from '@builder.io/qwik';
import { DocumentHead, RequestHandler, useEndpoint, useLocation } from '@builder.io/qwik-city';
import { getContent, RenderContent, getBuilderSearchParams } from '@builder.io/sdk-qwik';
import type { Dictionary } from '@builder.io/sdk-qwik/types/types/typescript';

export const BUILDER_PUBLIC_API_KEY = 'fe30f73e01ef40558cd69a9493eba2a2'; // ggignore
export const MODEL = 'content-page';
export const LOCALHOST = true;
export const QWIK_REST_API = LOCALHOST ? 'http://localhost:4321' : 'https://cdn.builder.io';

export default component$(() => {
  const location = useLocation();
  const isSDK = location.query.render === 'sdk';

  const resource = useEndpoint<typeof onRequest>();
  const onResolved = isSDK
    ? (content: any) => (
        <RenderContent model={MODEL} content={content} apiKey={BUILDER_PUBLIC_API_KEY} />
      )
    : (builderContent: BuilderContent) => {
        return <main class="builder" dangerouslySetInnerHTML={builderContent.html} />;
      };

  return (
    <>
      <Resource
        value={resource}
        onResolved={onResolved}
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
});

export const onRequest: RequestHandler<BuilderContent> = async ({ url }) => {
  const searchParams: Dictionary<string> = {};
  url.searchParams.forEach((value, key) => (searchParams[key] = value));
  const isSDK = searchParams.render === 'sdk';
  if (isSDK) {
    return getContent({
      model: MODEL,
      apiKey: BUILDER_PUBLIC_API_KEY,
      options: getBuilderSearchParams(searchParams),
      userAttributes: {
        urlPath: url.pathname,
      },
    }) as any;
  } else {
    const qwikUrl = new URL(QWIK_REST_API + '/api/v1/qwik/' + MODEL);
    qwikUrl.searchParams.set('apiKey', BUILDER_PUBLIC_API_KEY);
    qwikUrl.searchParams.set('userAttributes.urlPath', url.pathname);

    const response = await fetch(qwikUrl.href);
    if (response.ok) {
      const content: BuilderContent = JSON.parse(await response.text());
      return content;
    }
    throw new Error('Unable to load Builder content');
  }
};

interface BuilderContent {
  html: string;
}

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
