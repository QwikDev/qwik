import { component$ } from '@builder.io/qwik';
import { usePage } from '@builder.io/qwik-city';
import type { PageHeadFunction } from 'packages/qwik-city/src/runtime/types';
import NotFound from '../../layouts/not-found/not-found';

export const Page = component$(() => {
  const page = usePage();
  if (page) {
    // const attrs = page.attributes;
    // const Layout = page.layout;
    // const Content = page.content;

    // return (
    //   <Layout>
    //     <Content />
    //   </Layout>
    // );
    return <div>fu</div>;
  }
  return <NotFound />;
});

export const head: PageHeadFunction = () => {
  return { title: 'fu' };
};
