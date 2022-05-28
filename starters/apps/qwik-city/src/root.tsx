import { App } from './components/app/app';

import './global.css';

export const Root = () => {
  return (
    <html lang="en">
      <head>
        <Head />
      </head>
      <body>
        <App />
      </body>
    </html>
  );
};

const Head = () => (
  <>
    <meta charSet="utf-8" />

    <title>QwikCity Example</title>
    <meta name="viewport" content="width=device-width" />

    <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
    <link rel="icon" href="/favicons/favicon.svg" type="image/svg+xml" />

    <meta property="og:locale" content="en_US" />
  </>
);
