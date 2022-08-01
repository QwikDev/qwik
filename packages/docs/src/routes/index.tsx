import { component$, useUserContext } from '@builder.io/qwik';
import type { EndpointHandler } from '@builder.io/qwik-city';

export default component$(() => {
  // const resource = useEndpoint<typeof onRequest>();

  const userCtx = useUserContext('qwikcity');

  return <div>{JSON.stringify(userCtx)}</div>;

  // return (
  //   <Resource
  //     resource={resource}
  //     onResolved={(builderContent) => {
  //       return <main class="builder" dangerouslySetInnerHTML={builderContent.html} />;
  //     }}
  //     onRejected={(r) => {
  //       return (
  //         <div>
  //           Unable to load content <span hidden>{r}</span>
  //         </div>
  //       );
  //     }}
  //   />
  // );
});

export const onRequest: EndpointHandler<BuilderContent> = async ({ url }) => {
  const qwikUrl = new URL('https://cdn.builder.io/api/v1/qwik/content-page');
  qwikUrl.searchParams.set('apiKey', 'fe30f73e01ef40558cd69a9493eba2a2');
  qwikUrl.searchParams.set('userAttributes.urlPath', url.pathname);

  const content: BuilderContent = {
    html: qwikUrl.href,
  };
  return content;

  // const response = await fetch(qwikUrl.href);
  // if (response.ok) {
  //   const content: BuilderContent = await response.json();
  //   return content;
  // }
  // throw new Error('Unable to load content');
};

interface BuilderContent {
  html: string;
}
