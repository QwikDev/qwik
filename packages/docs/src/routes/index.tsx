import { type DocumentHead } from '@qwik.dev/router';
import { component$ } from '@qwik.dev/core';
import BuilderContentComp from '../components/builder-content';
import { Footer } from '../components/footer/footer';
import { Header } from '../components/header/header';
import { QWIK_MODEL, QWIK_PUBLIC_API_KEY } from '../constants';

export default component$(() => {
  return (
    <>
      <Header />
      <main>
        <BuilderContentComp apiKey={QWIK_PUBLIC_API_KEY} model={QWIK_MODEL} tag="main" />
      </main>
      <div class="px-4">
        <Footer />
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
