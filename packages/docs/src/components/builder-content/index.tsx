import { component$, Resource, useResource$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';
// import { getBuilderSearchParams, getContent, RenderContent } from '@builder.io/sdk-qwik';

export default component$<{
  apiKey: string;
  model: string;
  tag: 'main' | 'div';
}>((props) => {
  const location = useLocation();
  const builderContentRsrc = useResource$<any>(({ cache }) => {
    const query = location.query;
    const render =
      typeof query.get === 'function' ? query.get('render') : (query as { render?: string }).render;
    const isSDK = render === 'sdk';
    cache('immutable');
    // if (isSDK) {
    //   return getCachedValue(
    //     {
    //       model: props.model!,
    //       apiKey: props.apiKey!,
    //       options: getBuilderSearchParams(location.query),
    //       userAttributes: {
    //         urlPath: location.pathname,
    //       },
    //     },
    //     getContent
    //   );
    // } else {
    //   return getCachedValue(
    //     {
    //       apiKey: props.apiKey,
    //       model: props.model,
    //       urlPath: location.pathname,
    //     },
    //     getBuilderContent
    //   );
    // }
    return {
      html: '',
    }
  });

  return (
    <Resource
      value={builderContentRsrc}
      onPending={() => <div>Loading...</div>}
      onResolved={(content) =>
        <props.tag class="builder" dangerouslySetInnerHTML={content.html} />
        // content.html ? (
        // ) : (
        //   <RenderContent model={props.model} content={content} apiKey={props.apiKey} />
        // )
      }
    />
  );
});

export const isDev = import.meta.env.DEV;
export const CACHE = new Map<string, { timestamp: number; content: Promise<any> }>();
export function getCachedValue<T>(
  key: T,
  factory: (key: T) => Promise<any>,
  cacheTime = 1000 * 60 * 5 // 5 minutes
) {
  const now = Date.now();
  const keyString = JSON.stringify({
    ...key,
    // HACK
    // We ignore the urlPath for caching purposes as it would create way to many requests.
    // and we know that all of them are the same
    urlPath: '*',
  });
  const cacheValue = CACHE.get(keyString);
  if (cacheValue && cacheValue.timestamp + cacheTime > now) {
    // eslint-disable-next-line no-console
    isDev && console.log('cache hit', keyString);
    return cacheValue.content;
  } else {
    // eslint-disable-next-line no-console
    isDev && console.log('cache miss', keyString);
    const content = factory(key);
    CACHE.set(keyString, { timestamp: now, content });
    return content;
  }
}

export interface BuilderContent {
  html: string;
}

export async function getBuilderContent({
  apiKey,
  model,
  urlPath,
  cacheBust = false,
}: {
  apiKey: string;
  model: string;
  urlPath: string;
  cacheBust?: boolean;
}): Promise<BuilderContent> {
  const qwikUrl = new URL('https://cdn.builder.io/api/v1/qwik/' + model);
  qwikUrl.searchParams.set('apiKey', apiKey);
  qwikUrl.searchParams.set('userAttributes.urlPath', urlPath);
  qwikUrl.searchParams.set('userAttributes.site', 'qwik.builder.io');
  if (cacheBust) {
    qwikUrl.searchParams.set('cachebust', 'true');
  }

  const response = await fetch(qwikUrl.href);
  if (response.ok) {
    const content: BuilderContent = JSON.parse(await response.text());
    return content;
  }
  throw new Error('Unable to load Builder content');
}
