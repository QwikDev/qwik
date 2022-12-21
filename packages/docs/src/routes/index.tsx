import { component$ } from '@builder.io/qwik';
import { DocumentHead, loader$ } from '@builder.io/qwik-city';
import BuilderContentComp, { getBuilderContent } from '../components/builder-content';
import { QWIK_MODEL, QWIK_PUBLIC_API_KEY } from '../constants';

export default component$(() => {
  const builder = getBuilder.use();

  return (
    <BuilderContentComp
      html={builder.value.html}
      apiKey={QWIK_PUBLIC_API_KEY}
      model={QWIK_MODEL}
      tag="main"
    />
  );
});

export const getBuilder = loader$(({ pathname }) => {
  return getBuilderContent({
    apiKey: QWIK_PUBLIC_API_KEY,
    model: QWIK_MODEL,
    urlPath: pathname,
    cacheBust: true,
  });
});

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
