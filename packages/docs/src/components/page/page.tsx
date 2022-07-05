import { component$ } from '@builder.io/qwik';
import { Builder } from '../../layouts/builder/builder';
// import { useLocation } from '@builder.io/qwik-city';
// import Playground from '../../layouts/playground/playground';
// import Examples from '../../layouts/examples/examples';

export const Page = component$(() => {
  // const doc = useDocument();
  // const loc = useLocation();

  // if (loc.pathname === '/playground') {
  //   return <Playground />;
  // }

  // if (loc.pathname.startsWith('/examples/')) {
  //   const p = loc.pathname.split('/');
  //   const appId = `${p[2]}/${p[3]}`;
  //   return <Examples appId={appId} />;
  // }

  // const page = usePage();
  // if (page) {
  //   // const attrs = page.attributes;
  //   // const Layout = page.layout;
  //   // const Content = page.content;

  //   return <div>TODO!</div>;
  // }

  return <Builder />;
});
