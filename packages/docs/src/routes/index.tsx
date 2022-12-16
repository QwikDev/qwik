import { component$, Resource } from '@builder.io/qwik';
import { DocumentHead, RequestHandler, useEndpoint } from '@builder.io/qwik-city';
import BuilderContentComp, {
  BuilderContent,
  getBuilderContent,
} from '../components/builder-content';
import { QWIK_MODEL, QWIK_PUBLIC_API_KEY } from '../constants';

export default component$(() => {
  const resource = useEndpoint<typeof onGet>();

  return (
    <Resource
      value={resource}
      onResolved={(builderContent) => {
        return (
          <BuilderContentComp
            html={builderContent.html}
            apiKey={QWIK_PUBLIC_API_KEY}
            model={QWIK_MODEL}
            tag="main"
          />
        );
      }}
      onRejected={(r) => {
        return (
          <div>
            Unable to load content <span hidden>{r}</span>
          </div>
        );
      }}
    />
  );
});

export const onGet: RequestHandler<BuilderContent> = async ({ url }) => {
  return getBuilderContent(QWIK_PUBLIC_API_KEY, QWIK_MODEL, url.pathname);
};

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
