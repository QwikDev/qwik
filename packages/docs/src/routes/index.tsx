import { component$ } from '@builder.io/qwik';
import { type DocumentHead } from '@builder.io/qwik-city';
import BuilderContentComp from '../components/builder-content';
import { Footer } from '../components/footer/footer';
import { Header } from '../components/header/header';
import { Sponsors } from '~/components/sponsors/sponsors';
import { QWIK_MODEL, QWIK_PUBLIC_API_KEY } from '../constants';

export default component$(() => {
  return (
    <>
      <Header />
      <main>
        <BuilderContentComp apiKey={QWIK_PUBLIC_API_KEY} model={QWIK_MODEL} tag="main" />
        <Sponsors />
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
