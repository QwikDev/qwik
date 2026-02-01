import { component$ } from '@qwik.dev/core';
import { Link, type DocumentHead } from '@qwik.dev/router';
import { Footer } from '../components/footer/footer';
import { Header } from '../components/header/header';

export default component$(() => {
  return (
    <>
      <Header />
      <main class="flex flex-col items-center justify-center flex-1 px-4 text-center">
        <h1 class="text-5xl font-bold mb-6">Welcome to Qwik v2!</h1>
        <p class="text-lg max-w-xl">
          Qwik is a next-generation web framework designed for the edge. It enables instant loading
          web applications with fine-grained lazy loading and resumability.
        </p>
        <Link class="mt-6 text-blue-600 underline" href="./tutorial/welcome/overview">
          Get started with the Qwik tutorial!
        </Link>
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
