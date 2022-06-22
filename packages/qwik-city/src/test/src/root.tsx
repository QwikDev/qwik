// import { Analytics } from './components/head/analytics';
// import { Common } from './components/head/common';
import { routes } from '@qwik-city-app';
import { createQwikCity, HeadComponent } from '@builder.io/qwik-city';

export const head: HeadComponent = (props) => {
  return (
    <>
      <title>fu</title>
      {/* <Common {...props} />
      <Analytics {...props} /> */}
    </>
  );
};

export default createQwikCity({ routes }, ({ Head, Content }) => {
  return (
    <html lang="en">
      <Head />
      <body class="light">
        <Content />
      </body>
    </html>
  );
});
